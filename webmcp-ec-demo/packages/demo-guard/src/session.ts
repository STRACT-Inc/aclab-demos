import { randomBytes } from "node:crypto";
import type { GuardConfig } from "./config.ts";
import { keys } from "./keys.ts";
import type { Store } from "./store.ts";

/**
 * チャットのセッション予算。
 * キーの TTL がそのままセッションの有効期間で、失効したキーは読めなくなる。
 * 読んで書き戻す形なので、同じセッションから同時に投げると数え落としが起き得る。
 * 1 タブの会話は直列なので実害は小さく、費用の天井は日次上限で守る。
 */

export interface SessionBudget {
  /** このセッションのユーザー発話の数 */
  turns: number;
  /** いまの発話でのモデル呼び出しの数 */
  callsInTurn: number;
  /** いまの発話でのツール呼び出しの数 */
  toolsInTurn: number;
}

export type BudgetOutcome =
  | { type: "ok"; budget: SessionBudget }
  /** セッションが失効した(再発行が要る) */
  | { type: "expired" }
  /** セッションあたりの発話の上限に達した */
  | { type: "session_limit" }
  /** 1 発話あたりのモデル呼び出しの上限に達した */
  | { type: "turn_limit" }
  /** 1 発話あたりのツール呼び出しの上限に達した */
  | { type: "tool_limit" };

export interface IssuedSession {
  chatSessionId: string;
  /** 失効時刻(ISO 8601)。クライアントの表示用 */
  expiresAt: string;
  budget: { turns: number };
}

/** セッションを発行する。ID は 128bit の乱数で、統計の telemetry_id とは別の値 */
export async function issueChatSession(
  store: Store,
  cfg: GuardConfig,
  now: Date = new Date(),
): Promise<IssuedSession> {
  const chatSessionId = randomBytes(16).toString("base64url");
  await store.hcreate(
    keys.chatSession(cfg.demo, chatSessionId),
    { turns: 0, calls_in_turn: 0, tools_in_turn: 0 },
    cfg.sessionTtlSeconds,
  );
  return {
    chatSessionId,
    expiresAt: new Date(now.getTime() + cfg.sessionTtlSeconds * 1000).toISOString(),
    budget: { turns: cfg.turnsPerSession },
  };
}

const toInt = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * モデル呼び出しを 1 つ取る。新しい発話なら発話数を増やし、発話内のカウンタを 0 に戻す。
 * 新しい発話かどうかは、messages の末尾がユーザーの文章か tool_result かで呼び出し側が決める。
 */
export async function takeModelCall(
  store: Store,
  cfg: GuardConfig,
  chatSessionId: string,
  isNewTurn: boolean,
): Promise<BudgetOutcome> {
  const key = keys.chatSession(cfg.demo, chatSessionId);
  const state = await store.hgetall(key);
  if (!state) return { type: "expired" };

  const turns = toInt(state.turns) + (isNewTurn ? 1 : 0);
  if (turns > cfg.turnsPerSession) return { type: "session_limit" };

  const callsInTurn = (isNewTurn ? 0 : toInt(state.calls_in_turn)) + 1;
  if (callsInTurn > cfg.modelCallsPerTurn) return { type: "turn_limit" };

  const toolsInTurn = isNewTurn ? 0 : toInt(state.tools_in_turn);
  if (toolsInTurn > cfg.toolCallsPerTurn) return { type: "tool_limit" };

  const written = await store.hset(key, {
    turns,
    calls_in_turn: callsInTurn,
    tools_in_turn: toolsInTurn,
  });
  if (!written) return { type: "expired" };

  return { type: "ok", budget: { turns, callsInTurn, toolsInTurn } };
}

/** モデルが返したツール呼び出しの数を足す。セッションが失効していれば null */
export async function addToolCalls(
  store: Store,
  cfg: GuardConfig,
  chatSessionId: string,
  count: number,
): Promise<number | null> {
  if (count <= 0) return 0;
  return store.hincr(keys.chatSession(cfg.demo, chatSessionId), "tools_in_turn", count);
}
