import { z } from "zod";
import type { GuardConfig } from "./config.ts";
import { errorResponse, noContent } from "./http.ts";
import { clientIp, ipHash } from "./ip.ts";
import { keys } from "./keys.ts";
import { checkTelemetryRate } from "./limits.ts";
import { consoleLogger, type Logger } from "./log.ts";
import type { Store } from "./store.ts";

/**
 * 統計の受け口。
 * 認証なしで書き込めるので、スキーマ・キーのカタログ・サイズ・回数のすべてで絞る。
 * `TELEMETRY_ENABLED=false` の間は 404 を返し、何も保存しない。
 */

export interface SummaryCatalog {
  /** 受け付けるツール名(デモの 13 本) */
  toolNames: readonly string[];
  /** 受け付けるシナリオ ID(scenarios.json) */
  scenarioIds: readonly string[];
}

const count = z.number().int().min(0).max(100_000);

/** エラーコードごとの件数。コードは付録 A の形に合わせる */
const errorCounts = z
  .record(z.string().regex(/^[a-z_]{1,32}$/), count)
  .refine((value) => Object.keys(value).length <= 12, {
    message: "エラーコードの種類が多すぎます",
  });

const toolStats = z.object({ ok: count, err: errorCounts.default({}) }).strict();

/** 要約のスキーマ。ツール名とシナリオ ID はカタログにある名前だけを受け付ける */
export function summarySchema(catalog: SummaryCatalog) {
  const tools = z
    .object(Object.fromEntries(catalog.toolNames.map((name) => [name, toolStats.optional()])))
    .strict();
  const scenarios = z
    .object(
      Object.fromEntries(
        catalog.scenarioIds.map((id) => [id, z.enum(["pass", "fail"]).optional()]),
      ),
    )
    .strict();

  return z
    .object({
      schema: z.literal(1),
      consent_version: z.string().regex(/^\d{4}-\d{2}$/),
      telemetry_id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
      /** 時単位に丸めた開始時刻。日付より細かい時刻は取らない */
      started_hour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
      from_article: z.boolean(),
      browser: z
        .object({
          brand: z.string().max(32),
          major: z.number().int().min(0).max(1_000),
          mobile: z.boolean(),
        })
        .strict(),
      webmcp: z
        .object({
          mode: z.enum(["native", "polyfill", "none"]),
          ot_token_present: z.boolean(),
          tools_max: z.number().int().min(0).max(100),
        })
        .strict(),
      chat: z
        .object({
          opened: z.boolean(),
          turns: count,
          iterations: count,
          stopped_by: z.object({ done: count, limit: count, abort: count }).strict(),
          model_latency_ms_bucket: z
            .object({ "<2s": count.optional(), "2-5s": count.optional(), "5s+": count.optional() })
            .strict()
            .default({}),
        })
        .strict(),
      tools,
      external_tool_calls: count,
      declarative_activated: count,
      scenarios,
      order: z.object({ staged: count, confirmed_by_user: count }).strict(),
      lab: z
        .object({ hint_ignored: z.boolean(), description_lang: z.enum(["ja", "en"]) })
        .strict(),
    })
    .strict();
}

export type Summary = z.infer<ReturnType<typeof summarySchema>>;

export interface TelemetryDeps {
  store: Store;
  config: GuardConfig;
  catalog: SummaryCatalog;
  logger?: Logger;
}

/**
 * `POST /api/telemetry` のハンドラ。
 * 受理 204 / スキーマ違反 400 / サイズ超過 413 / 回数超過 429、無効時は 404。
 */
export function createTelemetryHandler(deps: TelemetryDeps) {
  const { store, config, catalog } = deps;
  const log = deps.logger ?? consoleLogger;
  const schema = summarySchema(catalog);

  return async function handleTelemetry(req: Request): Promise<Response> {
    if (!config.telemetryEnabled) return noContent(404);

    const body = await req.text();
    if (new TextEncoder().encode(body).length > config.telemetryMaxBytes) {
      log("telemetry_rejected", { reason: "too_large" });
      return errorResponse("too_large", "要約が大きすぎます", 413);
    }

    const hashed = ipHash(clientIp(req), config.ipHashSecret);
    try {
      const rate = await checkTelemetryRate(store, config, hashed);
      if (!rate.ok) {
        log("telemetry_rejected", { reason: "rate_limited" });
        return errorResponse("rate_limited", "受け付けの上限です", 429);
      }
    } catch {
      // ストアに届かないときは統計を捨てる。チャットと違い、止める理由がない
      log("telemetry_dropped", { reason: "store_unavailable" });
      return noContent();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      log("telemetry_rejected", { reason: "invalid_json" });
      return errorResponse("invalid_json", "JSON として読めません", 400);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      log("telemetry_rejected", { reason: "invalid_schema" });
      return errorResponse("invalid_schema", "要約の形が合いません", 400);
    }

    const summary = result.data;
    const month = summary.started_hour.slice(0, 7);
    try {
      await store.set(
        keys.telemetrySummary(config.demo, month, summary.telemetry_id),
        JSON.stringify(summary),
        config.telemetryTtlDays * 24 * 60 * 60,
      );
    } catch {
      log("telemetry_dropped", { reason: "store_unavailable" });
      return noContent();
    }

    log("telemetry_saved", { month, turns: summary.chat.turns, mode: summary.webmcp.mode });
    return noContent();
  };
}
