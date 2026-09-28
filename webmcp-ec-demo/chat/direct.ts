"use client";

import type { SseMessage } from "./sse.ts";

/**
 * ブラウザから Anthropic API を直接呼ぶ。
 * 返すイベントは `/api/chat` と同じ形にして、ループ側が経路を意識せずに済むようにする。
 *
 * 直接呼ぶには専用のオプトインヘッダーが要る(2026-09-14 に SDK の実装で確認:
 * `anthropic-dangerous-direct-browser-access`)。キーがブラウザに出るため、
 * 自分のキーを自分で入れた読者にだけ使わせる。
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface DirectParams {
  model: string;
  max_tokens: number;
  /** `/api/chat` と同じ形(キャッシュの区切り + ページの 1 行) */
  system: unknown;
  tools: unknown[];
  messages: unknown[];
}

interface ToolUseAccumulator {
  id: string;
  name: string;
  json: string;
}

/** `/api/chat` と同じイベント(text_delta / tool_use / usage / done / error)に直して流す */
export async function* streamDirect(
  params: DirectParams,
  options: { apiKey: string; signal: AbortSignal },
): AsyncGenerator<SseMessage> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ ...params, stream: true }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    yield {
      event: "error",
      data: {
        code: response.status === 401 ? "byo_key_invalid" : "byo_request_failed",
        message: body?.error?.message ?? `Anthropic API が ${response.status} を返しました`,
      },
    };
    return;
  }

  const pending = new Map<number, ToolUseAccumulator>();
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const { event, data } of readAnthropicSse(response)) {
    const payload = data as Record<string, unknown>;
    switch (event) {
      case "message_start": {
        const usage = (payload.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
        inputTokens = usage?.input_tokens ?? 0;
        break;
      }
      case "content_block_start": {
        const block = payload.content_block as { type?: string; id?: string; name?: string };
        if (block?.type === "tool_use" && block.id && block.name) {
          pending.set(payload.index as number, { id: block.id, name: block.name, json: "" });
        }
        break;
      }
      case "content_block_delta": {
        const delta = payload.delta as { type?: string; text?: string; partial_json?: string };
        if (delta?.type === "text_delta" && delta.text) {
          yield { event: "text_delta", data: { text: delta.text } };
        } else if (delta?.type === "input_json_delta") {
          const slot = pending.get(payload.index as number);
          if (slot) slot.json += delta.partial_json ?? "";
        }
        break;
      }
      case "content_block_stop": {
        const slot = pending.get(payload.index as number);
        if (!slot) break;
        pending.delete(payload.index as number);
        // 引数が空のツールは partial_json が来ない
        let input: unknown = {};
        try {
          if (slot.json) input = JSON.parse(slot.json);
        } catch {
          input = {};
        }
        yield { event: "tool_use", data: { id: slot.id, name: slot.name, input } };
        break;
      }
      case "message_delta": {
        const usage = payload.usage as { output_tokens?: number } | undefined;
        outputTokens = usage?.output_tokens ?? outputTokens;
        const delta = payload.delta as { stop_reason?: string } | undefined;
        yield {
          event: "usage",
          data: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_read_input_tokens: 0,
          },
        };
        yield { event: "done", data: { stop_reason: delta?.stop_reason ?? "end_turn" } };
        break;
      }
      case "error": {
        const error = payload.error as { message?: string } | undefined;
        yield {
          event: "error",
          data: { code: "byo_request_failed", message: error?.message ?? "応答に失敗しました" },
        };
        break;
      }
    }
  }
}

/** Anthropic の SSE をそのまま読む(こちらは event 名が API の語) */
async function* readAnthropicSse(response: Response): AsyncGenerator<SseMessage> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let name = "message";
      const lines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) lines.push(line.slice(5).trim());
      }
      if (lines.length > 0) {
        try {
          yield { event: name, data: JSON.parse(lines.join("\n")) };
        } catch {
          /* 壊れた行は捨てる */
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
