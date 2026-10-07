import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { GuardConfig } from "./config.ts";
import { errorResponse, SSE_HEADERS, sseEvent } from "./http.ts";

import { clientIp, ipHash } from "./ip.ts";
import { checkRequestRate, takeDailyModelCall } from "./limits.ts";
import { consoleLogger, type Logger } from "./log.ts";
import { addToolCalls, takeModelCall } from "./session.ts";
import type { Store } from "./store.ts";
import { jsonUpTo, normalizeTool, TOOLS_TOTAL_MAX_CHARS, toolDeclSchema } from "./tool-schema.ts";

/**
 * チャットの中継。
 * ループの制御はページ側にあり、ここはモデルを 1 回呼んでストリームを返すだけ。
 * ツールの実行はページで行うので、サーバはツールを実行しない。
 */

/** 切り詰めたツール結果の代わりに入れる印 */
const TRIMMED = "[古い結果は省略しました]";

/**
 * tool_use.input の上限(JSON 文字列で数える)。モデルが出した引数をページが送り返す
 * だけなので、ラボのツールでは数百字。text や tool_result と同じく、ここも本文の上限に入れる
 */
const TOOL_INPUT_MAX_CHARS = 4_000;

const textBlock = z.object({ type: z.literal("text"), text: z.string().max(20_000) }).strict();
const toolUseBlock = z
  .object({
    type: z.literal("tool_use"),
    id: z.string().max(64),
    name: z.string().max(64),
    input: jsonUpTo(TOOL_INPUT_MAX_CHARS, "tool_use.input"),
  })
  .strict();
const toolResultBlock = z
  .object({
    type: z.literal("tool_result"),
    tool_use_id: z.string().max(64),
    content: z.string().max(20_000),
    is_error: z.boolean().optional(),
  })
  .strict();

const userMessage = z
  .object({
    role: z.literal("user"),
    content: z.union([z.string().max(20_000), z.array(z.union([textBlock, toolResultBlock]))]),
  })
  .strict();
const assistantMessage = z
  .object({
    role: z.literal("assistant"),
    content: z.array(z.union([textBlock, toolUseBlock])),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    chat_session_id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    messages: z.array(z.union([userMessage, assistantMessage])).min(1).max(120),
    tools: z
      .array(toolDeclSchema)
      .max(40)
      .refine((tools) => JSON.stringify(tools).length <= TOOLS_TOTAL_MAX_CHARS, {
        message: `tools は合計 JSON ${TOOLS_TOTAL_MAX_CHARS} 字までです`,
      })
      .default([]),
    /**
     * いま開いているページ。ブラウザ内蔵のエージェントは URL と画面を見ているが、
     * ラボのチャットはツールしか渡さないので、そのぶんを 1 行で補う。
     * これはハーネスの都合で、ページのツール設計の話ではない。
     */
    page: z.string().max(200).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
type Message = ChatRequest["messages"][number];

/** モデルのストリーム。SDK の client.messages.stream() をそのまま渡せる形 */
export interface ModelStream extends AsyncIterable<Anthropic.MessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Message>;
}

export interface ModelClient {
  stream(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal; timeout?: number },
  ): ModelStream;
}

export interface ChatDeps {
  store: Store;
  config: GuardConfig;
  model: ModelClient;
  /** システムプロンプト。デモごとに変わるので外から渡す */
  systemPrompt: string;
  logger?: Logger;
}

/** 末尾がユーザーの文章なら新しい発話、tool_result だけなら同じ発話の続き */
export function isNewTurn(messages: Message[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return false;
  if (typeof last.content === "string") return true;
  return last.content.some((block) => block.type === "text");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…(切り詰め)`;
}

/** ユーザー発話とツール結果の長さをサーバ側でも抑える */
function clampMessages(messages: Message[], config: GuardConfig): Message[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    if (typeof message.content === "string") {
      return { ...message, content: truncate(message.content, config.userMessageMaxChars) };
    }
    return {
      ...message,
      content: message.content.map((block) =>
        block.type === "text"
          ? { ...block, text: truncate(block.text, config.userMessageMaxChars) }
          : { ...block, content: truncate(block.content, config.toolResultMaxChars) },
      ),
    };
  });
}

const sizeOf = (message: Message): number => JSON.stringify(message).length;
const isToolResultOnly = (message: Message): boolean =>
  message.role === "user" &&
  Array.isArray(message.content) &&
  message.content.every((block) => block.type === "tool_result");

/**
 * 文脈を上限まで削る。古いツール結果の中身から捨て、それでも超えるなら
 * 古いメッセージを落とす。tool_use と tool_result が片方だけ残らないように整える。
 */
export function trimContext(messages: Message[], maxChars: number): Message[] {
  const out: Message[] = messages.map((message) => structuredClone(message));
  let total = out.reduce((sum, message) => sum + sizeOf(message), 0);

  for (let i = 0; i < out.length - 2 && total > maxChars; i++) {
    const message = out[i];
    if (message?.role !== "user" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === "tool_result" && block.content !== TRIMMED) {
        total -= block.content.length - TRIMMED.length;
        block.content = TRIMMED;
      }
    }
  }

  while (total > maxChars && out.length > 2) {
    total -= sizeOf(out[0]!);
    out.shift();
  }

  // 先頭は「ツール結果だけの user」や assistant にしない(対の tool_use が消えているため)
  while (out.length > 1 && (out[0]!.role === "assistant" || isToolResultOnly(out[0]!))) {
    out.shift();
  }
  return out;
}

/**
 * `POST /api/chat` のハンドラ。
 * 上限に触れたときはストリームを始めず、HTTP のステータスとコードで返す。
 */
export function createChatHandler(deps: ChatDeps) {
  const { store, config, model, systemPrompt } = deps;
  const log = deps.logger ?? consoleLogger;

  return async function handleChat(req: Request): Promise<Response> {
    if (!config.chatEnabled) {
      return errorResponse("chat_disabled", "チャットは一時的に止めています", 503);
    }

    const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("invalid_request", "リクエストの形が合いません", 400);
    }
    const { chat_session_id: sessionId, messages, tools, page } = parsed.data;

    const hashed = ipHash(clientIp(req), config.ipHashSecret);
    const newTurn = isNewTurn(messages);

    let budget: Awaited<ReturnType<typeof takeModelCall>>;
    try {
      const rate = await checkRequestRate(store, config, hashed);
      if (!rate.ok) return errorResponse("rate_limited", "しばらく時間をおいてください", 429);

      budget = await takeModelCall(store, config, sessionId, newTurn);
      if (budget.type === "expired") {
        return errorResponse("session_expired", "セッションが切れました。開き直してください", 410);
      }
      if (budget.type === "session_limit") {
        return errorResponse("session_limit", "このセッションの上限です", 429);
      }
      if (budget.type === "turn_limit" || budget.type === "tool_limit") {
        return errorResponse(budget.type, "1 回の指示で試せる上限です", 429);
      }

      const daily = await takeDailyModelCall(store, config);
      if (!daily.ok) {
        log("chat_blocked", { reason: "daily_limit", count: daily.count });
        return errorResponse("daily_limit", "本日の上限に達しました", 429);
      }
    } catch {
      // ストアに届かないときは Anthropic を呼ばない
      log("chat_blocked", { reason: "store_unavailable" });
      return errorResponse("store_unavailable", "一時的に利用できません", 503);
    }

    const prepared = trimContext(clampMessages(messages, config), config.contextMaxChars);
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: config.model,
      max_tokens: config.maxTokens,
      // system と tools は毎回同じバイト列にしてキャッシュに当てる。
      // ★プロンプトが最小キャッシュ長に届かない場合は素通しになる。usage で確かめる。
      // ページの行はキャッシュの区切りより後ろに置く(前に入れると毎回作り直しになる)
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
        ...(page ? [{ type: "text" as const, text: `いま開いているページ: ${page}` }] : []),
      ],
      tools: tools.map(normalizeTool),
      messages: prepared as Anthropic.MessageParam[],
    };

    const startedAt = Date.now();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        try {
          const modelStream = model.stream(params, {
            signal: req.signal,
            timeout: config.modelTimeoutMs,
          });
          for await (const event of modelStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta" &&
              event.delta.text
            ) {
              send("text_delta", { text: event.delta.text });
            }
          }

          const message = await modelStream.finalMessage();
          const toolUses = message.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );
          for (const toolUse of toolUses) {
            send("tool_use", { id: toolUse.id, name: toolUse.name, input: toolUse.input });
          }
          if (toolUses.length > 0) {
            await addToolCalls(store, config, sessionId, toolUses.length).catch(() => null);
          }

          send("usage", {
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
          });
          send("done", { stop_reason: message.stop_reason });
          log("chat_done", {
            turns: budget.type === "ok" ? budget.budget.turns : 0,
            tools: toolUses.length,
            ms: Date.now() - startedAt,
            stop: message.stop_reason ?? "unknown",
          });
        } catch (error) {
          const aborted = req.signal.aborted;
          log("chat_error", { reason: aborted ? "aborted" : "model_error", ms: Date.now() - startedAt });
          if (!aborted) {
            send("error", { code: "model_error", message: "応答の生成に失敗しました" });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  };
}
