import type { GuardConfig, RateRule } from "./config.ts";
import { jstDate } from "./ip.ts";
import { keys } from "./keys.ts";
import type { Store } from "./store.ts";

/**
 * レート制限と日次上限。固定窓のカウンタで数える。
 * 窓の境目で最大 2 倍まで通り得るが、費用の天井は日次上限と Anthropic 側の
 * 利用上限で決まるので、この誤差は受け入れる。
 */

export interface LimitResult {
  ok: boolean;
  count: number;
  limit: number;
}

/** 日次上限のキーは、日付が変わったあとも少し残して様子を見られるようにする */
const DAILY_CAP_TTL_SECONDS = 48 * 60 * 60;

async function hit(store: Store, key: string, rule: RateRule): Promise<LimitResult> {
  const count = await store.incr(key, rule.windowSeconds);
  return { ok: count <= rule.limit, count, limit: rule.limit };
}

export function checkRequestRate(store: Store, cfg: GuardConfig, ip: string) {
  return hit(store, keys.requestRate(cfg.demo, ip), cfg.requestRate);
}

export function checkSessionIssueRate(store: Store, cfg: GuardConfig, ip: string) {
  return hit(store, keys.sessionIssueRate(cfg.demo, ip), cfg.sessionIssueRate);
}

export function checkTelemetryRate(store: Store, cfg: GuardConfig, ip: string) {
  return hit(store, keys.telemetryRate(cfg.demo, ip), cfg.telemetryRate);
}

/**
 * 全体の日次モデル呼び出しを 1 つ取る。
 * モデルを呼ぶ前に必ず通す。ここで ok が false なら Anthropic を呼ばない。
 */
export async function takeDailyModelCall(
  store: Store,
  cfg: GuardConfig,
  now: Date = new Date(),
): Promise<LimitResult> {
  const count = await store.incr(
    keys.dailyModelCalls(cfg.demo, jstDate(now)),
    DAILY_CAP_TTL_SECONDS,
  );
  return { ok: count <= cfg.dailyModelCalls, count, limit: cfg.dailyModelCalls };
}
