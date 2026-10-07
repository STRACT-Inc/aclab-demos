import {
  checkRequestRate,
  clientIp,
  errorResponse,
  ipHash,
  jsonResponse,
  takeDailyModelCall,
  type GuardConfig,
  type Logger,
  type Store,
} from "@aclab/demo-guard";
import { z } from "zod";
import { PREV_MAX_ITEMS, QUERY_MAX_CHARS } from "../../core/ask-limits.ts";
import { normalizeAskMessages } from "../../core/nlweb-response.ts";
import { ASK_MODES, askUpstream, type NlwebUpstream } from "./nlweb.ts";

/**
 * `/api/ask` の中継。
 * demo-guard の部品で IP ごとの回数と全体の日次上限を数え、NLWeb の /ask に転送する。
 * 数えるのは中継 1 回。NLWeb の中で走る LLM 呼び出しの数ではない。
 */

export const askBodySchema = z
  .object({
    query: z.string().trim().min(1).max(QUERY_MAX_CHARS),
    prev: z.array(z.string().trim().min(1).max(QUERY_MAX_CHARS)).max(PREV_MAX_ITEMS).default([]),
    mode: z.enum(ASK_MODES).default("list"),
  })
  .strict();

export interface AskHandlerDeps {
  store: Store;
  config: GuardConfig;
  upstream: NlwebUpstream;
  log: Logger;
  enabled: () => boolean;
  fetchImpl?: typeof fetch;
}

export function createAskHandler(deps: AskHandlerDeps): (req: Request) => Promise<Response> {
  const { store, config, upstream, log } = deps;
  return async (req) => {
    if (!deps.enabled()) return errorResponse("ask_disabled", "会話検索は停止中です", 503);

    const parsed = askBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("bad_request", `質問は 1〜${QUERY_MAX_CHARS} 字で入力してください`, 400);
    }

    // ストアに届かないときは NLWeb を呼ばない(fail closed)。本番で接続情報が無いと
    // unavailableStore が例外を投げるので、ここで 503 に変える
    try {
      const hash = ipHash(clientIp(req), config.ipHashSecret);
      const rate = await checkRequestRate(store, config, hash);
      if (!rate.ok) {
        log("ask_rate_limited", { count: rate.count });
        return errorResponse("rate_limited", "回数が多すぎます。しばらく待ってからお試しください", 429);
      }
      const daily = await takeDailyModelCall(store, config);
      if (!daily.ok) {
        log("ask_daily_cap", { count: daily.count });
        return errorResponse("daily_cap", "本日の上限に達しました。明日またお試しください", 429);
      }
    } catch {
      log("ask_blocked", { reason: "store_unavailable" });
      return errorResponse("store_unavailable", "一時的に利用できません", 503);
    }

    const started = Date.now();
    try {
      const messages = await askUpstream(upstream, parsed.data, deps.fetchImpl);
      const result = normalizeAskMessages(messages);
      log("ask_done", {
        ms: Date.now() - started,
        items: result.items.length,
        mode: parsed.data.mode,
        no_results: result.no_results,
        errors: result.errors.length,
      });
      return jsonResponse(result);
    } catch (error) {
      log("ask_upstream_failed", {
        ms: Date.now() - started,
        reason: error instanceof Error ? error.name : "unknown",
      });
      return errorResponse("upstream_failed", "検索サーバから応答がありませんでした", 502);
    }
  };
}
