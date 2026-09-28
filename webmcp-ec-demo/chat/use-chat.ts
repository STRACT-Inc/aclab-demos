"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "../state/keys.ts";
import { BYO_KEY_ENABLED, readByoKey } from "./byo-key.ts";
import { fenceToolResult, type ChatSettings } from "./fence.ts";
import { readSse, type SseMessage } from "./sse.ts";
import type { ChatEntry, StoppedBy, ToolDecl, ToolExecutor } from "./types.ts";

export type { ChatSettings } from "./fence.ts";

/**
 * ページ内エージェントのループ。
 * ツールの実行はページで行うので、制御はここに置き、サーバはモデル呼び出しだけを担う。
 * 上限はサーバ側でも数えるが、往復を無駄にしないようクライアントでも止める。
 */

/** 1 発話あたりのモデル呼び出し(サーバ側の上限と同じ値) */
const MAX_ITERATIONS = 6;
/** 1 発話あたりのツール呼び出し */
const MAX_TOOL_CALLS = 12;
/** ユーザー発話の長さ */
export const MAX_USER_CHARS = 500;
/** BYO キーで直接呼ぶときの上限。/api/chat の GUARD_MAX_TOKENS 既定値と揃える */
const DIRECT_MAX_TOKENS = 600;

/** BYO キーで直接呼ぶために要るもの(話題ごとのデモが渡す) */
export interface DirectConfig {
  systemPrompt: string;
  model: string;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: unknown;
}

interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface PendingConfirm {
  name: string;
  resolve: (allow: boolean) => void;
}

const toWireTool = (tool: ToolDecl) => ({
  name: tool.name,
  description: tool.description ?? "",
  input_schema: tool.input_schema ?? tool.inputSchema ?? { type: "object", properties: {} },
});

export function useChat(executor: ToolExecutor, settings: ChatSettings, direct?: DirectConfig) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [tools, setTools] = useState<ToolDecl[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);

  const history = useRef<ApiMessage[]>([]);
  const sessionId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // タブの中だけ会話を持つ
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEYS.chat);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        entries?: ChatEntry[];
        history?: ApiMessage[];
        chat_session_id?: string;
      };
      setEntries(saved.entries ?? []);
      history.current = saved.history ?? [];
      sessionId.current = saved.chat_session_id ?? null;
    } catch {
      /* 壊れていたら空から始める */
    }
  }, []);

  const persist = useCallback((next: ChatEntry[]) => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEYS.chat,
        JSON.stringify({
          entries: next,
          history: history.current,
          chat_session_id: sessionId.current,
        }),
      );
    } catch {
      /* 保存できない設定でも会話は続けられる */
    }
  }, []);

  // ツール一覧の変化を拾う(WebMCP では toolchange)
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      executor.listTools().then((list) => {
        if (alive) setTools(list);
      });
    };
    refresh();
    const unsubscribe = executor.subscribe(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [executor]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId.current) return sessionId.current;
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "none" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? "セッションを作れませんでした");
    }
    const data = (await res.json()) as { chat_session_id: string; budget?: { turns?: number } };
    sessionId.current = data.chat_session_id;
    setTurnsLeft(data.budget?.turns ?? null);
    return data.chat_session_id;
  }, []);

  const runTool = useCallback(
    async (call: ToolUse, decls: ToolDecl[], signal: AbortSignal): Promise<string> => {
      const decl = decls.find((tool) => tool.name === call.name);
      if (decl?.annotations?.consequentialHint && settingsRef.current.harnessConfirm) {
        const allowed = await new Promise<boolean>((resolve) => {
          setConfirming({ name: call.name, resolve });
        });
        setConfirming(null);
        if (!allowed) return JSON.stringify({ error: { code: "declined", message: "利用者が取り消しました" } });
      }
      const args = (call.input ?? {}) as object;
      const result = await executor.execute(call.name, args, { signal });
      return fenceToolResult(result, decl, settingsRef.current);
    },
    [executor],
  );

  const send = useCallback(
    /** `fresh` はシナリオの投入用。前の会話を捨てて 1 発話目から始める */
    async (text: string, opts: { fresh?: boolean } = {}) => {
      const trimmed = text.trim().slice(0, MAX_USER_CHARS);
      if (!trimmed || busy) return;

      if (opts.fresh) history.current = [];

      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      setError(null);

      let next: ChatEntry[] = [
        ...(opts.fresh ? [] : entries),
        { kind: "user", text: trimmed },
      ];
      setEntries(next);
      history.current = [
        ...history.current,
        { role: "user", content: [{ type: "text", text: trimmed }] },
      ];

      let stopped: StoppedBy = "done";
      let toolCalls = 0;

      try {
        // BYO キーがあるときはラボのサーバを通さない。キーは送り先が api.anthropic.com だけ。
        // フラグで畳めるように定数を直に見る(公開時はこの経路ごとバンドルから消える)
        const apiKey = BYO_KEY_ENABLED && direct ? readByoKey() : null;
        const id = apiKey ? null : await ensureSession();

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          // 前の往復で go_to_page が走っていると、登録の入れ直しが終わっていない。
          // 待たずに引くと、移動先のツールが 1 本欠けたままモデルに渡る(実機で確認)
          await executor.settle?.();
          const decls = await executor.listTools();
          setTools(decls);

          // ブラウザ内蔵のエージェントは URL を見ている。ラボのチャットにも同じだけ渡す
          const page = `${window.location.pathname}(${document.title})`;
          let source: AsyncGenerator<SseMessage>;

          // 定数を直に書く。別モジュールの再輸出だとバンドラが畳めず、
          // 公開するビルドにも直接呼びのチャンクが残る(2026-09-14 に確認)
          if (process.env.NEXT_PUBLIC_BYO_KEY_ENABLED === "true" && apiKey && direct) {
            const { streamDirect } = await import("./direct.ts");
            source = streamDirect(
              {
                model: direct.model,
                max_tokens: DIRECT_MAX_TOKENS,
                system: [
                  { type: "text", text: direct.systemPrompt, cache_control: { type: "ephemeral" } },
                  { type: "text", text: `いま開いているページ: ${page}` },
                ],
                tools: decls.map(toWireTool),
                messages: history.current,
              },
              { apiKey, signal: controller.signal },
            );
          } else {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                chat_session_id: id,
                messages: history.current,
                tools: decls.map(toWireTool),
                page,
              }),
            });

            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as {
                error?: { code?: string; message?: string };
              } | null;
              if (body?.error?.code === "session_expired") sessionId.current = null;
              setError(body?.error?.message ?? "応答を受け取れませんでした");
              stopped = "limit";
              break;
            }
            source = readSse(res);
          }

          let answer = "";
          const toolUses: ToolUse[] = [];
          let assistantIndex = -1;

          for await (const { event, data } of source) {
            if (event === "text_delta") {
              answer += (data as { text: string }).text;
              next =
                assistantIndex === -1
                  ? [...next, { kind: "assistant", text: answer }]
                  : next.map((entry, index) =>
                      index === assistantIndex ? { kind: "assistant", text: answer } : entry,
                    );
              if (assistantIndex === -1) assistantIndex = next.length - 1;
              setEntries(next);
            } else if (event === "tool_use") {
              toolUses.push(data as ToolUse);
            } else if (event === "error") {
              setError((data as { message?: string }).message ?? "応答に失敗しました");
              stopped = "limit";
            }
          }

          history.current = [
            ...history.current,
            {
              role: "assistant",
              content: [
                ...(answer ? [{ type: "text", text: answer }] : []),
                ...toolUses.map((call) => ({
                  type: "tool_use",
                  id: call.id,
                  name: call.name,
                  input: call.input ?? {},
                })),
              ],
            },
          ];

          if (toolUses.length === 0) break;
          if (toolCalls + toolUses.length > MAX_TOOL_CALLS) {
            stopped = "limit";
            setError("1 回の指示で試せるツールの上限です");
            break;
          }

          // ツールは直列に実行し、結果はまとめて 1 つの user メッセージで返す
          const results: unknown[] = [];
          for (const call of toolUses) {
            const startedAt = Date.now();
            next = [
              ...next,
              { kind: "tool", id: call.id, name: call.name, args: call.input, status: "running" },
            ];
            setEntries(next);
            let content: string;
            let status: "done" | "error" | "aborted" = "done";
            try {
              content = await runTool(call, decls, controller.signal);
            } catch (toolError) {
              status = controller.signal.aborted ? "aborted" : "error";
              content = JSON.stringify({
                error: { code: "tool_failed", message: String(toolError) },
              });
            }
            toolCalls += 1;
            const ms = Date.now() - startedAt;
            next = next.map((entry) =>
              entry.kind === "tool" && entry.id === call.id
                ? { ...entry, result: content, ms, status }
                : entry,
            );
            setEntries(next);
            results.push({ type: "tool_result", tool_use_id: call.id, content });
          }

          history.current = [...history.current, { role: "user", content: results }];
          if (iteration === MAX_ITERATIONS - 1) stopped = "limit";
        }
      } catch (loopError) {
        if (controller.signal.aborted) {
          stopped = "abort";
        } else {
          setError(loopError instanceof Error ? loopError.message : "応答に失敗しました");
          stopped = "limit";
        }
      } finally {
        if (stopped === "limit" || stopped === "abort") {
          next = [
            ...next,
            {
              kind: "notice",
              text: stopped === "abort" ? "停止しました" : "ここまでで打ち切りました",
            },
          ];
          setEntries(next);
        }
        setTurnsLeft((left) => (left === null ? null : Math.max(left - 1, 0)));
        setBusy(false);
        abort.current = null;
        setConfirming(null);
        persist(next);
      }
    },
    [busy, direct, ensureSession, entries, executor, persist, runTool],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
  }, []);

  const reset = useCallback(() => {
    history.current = [];
    sessionId.current = null;
    setEntries([]);
    setError(null);
    setTurnsLeft(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEYS.chat);
    } catch {
      /* 消せなくても続ける */
    }
  }, []);

  return { entries, tools, busy, error, turnsLeft, confirming, send, stop, reset };
}
