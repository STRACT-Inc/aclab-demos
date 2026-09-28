import { STORAGE_KEYS } from "./keys.ts";

/**
 * 統計の要約の積み上げと送信。
 * 送るのは「セッション 1 件につき要約 1 件」だけで、発話本文・引数・結果は入れない。
 * 公開時は無効なので、この経路は動かない。
 */

/** 60 秒ごとに同じ telemetry_id の要約を上書き送信する */
export const SEND_INTERVAL_MS = 60_000;
const ENDPOINT = "/api/telemetry";
const CONSENT_VERSION = "2026-09";

export interface ToolStat {
  ok: number;
  err: Record<string, number>;
}

export interface Summary {
  schema: 1;
  consent_version: string;
  telemetry_id: string;
  started_hour: string;
  from_article: boolean;
  browser: { brand: string; major: number; mobile: boolean };
  webmcp: { mode: "native" | "polyfill" | "none"; ot_token_present: boolean; tools_max: number };
  chat: {
    opened: boolean;
    turns: number;
    iterations: number;
    stopped_by: { done: number; limit: number; abort: number };
    model_latency_ms_bucket: Record<string, number>;
  };
  tools: Record<string, ToolStat>;
  external_tool_calls: number;
  declarative_activated: number;
  scenarios: Record<string, "pass" | "fail">;
  order: { staged: number; confirmed_by_user: number };
  lab: { hint_ignored: boolean; description_lang: "ja" | "en" };
}

export interface TelemetryGate {
  /** サーバの TELEMETRY_ENABLED と揃えたビルド時のフラグ */
  enabled: boolean;
  /** 読者が統計に協力すると答えたか */
  statsConsent: boolean;
}

/**
 * 送ってよいかの判定。無効か、同意が無ければ送らない。
 * この 1 つの関数だけが送信の可否を決める(テストでここを押さえる)。
 */
export function shouldSend(gate: TelemetryGate): boolean {
  return gate.enabled && gate.statsConsent;
}

/** ブラウザに置いた同意の記録を読む */
export function readStatsConsent(storage?: Storage): boolean {
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEYS.consent);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { stats?: boolean; version?: string };
    return parsed.version === CONSENT_VERSION && parsed.stats === true;
  } catch {
    return false;
  }
}

export interface TelemetryOptions {
  enabled: boolean;
  telemetryId: string;
  fromArticle: boolean;
  browser: Summary["browser"];
  consent: () => boolean;
  /** 送信の実体。既定は navigator.sendBeacon */
  send?: (url: string, body: string) => void;
  now?: () => Date;
}

const hourOf = (date: Date): string => date.toISOString().slice(0, 13);

export function createTelemetry(options: TelemetryOptions) {
  const now = options.now ?? (() => new Date());
  const send =
    options.send ??
    ((url: string, body: string) => {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    });

  const summary: Summary = {
    schema: 1,
    consent_version: CONSENT_VERSION,
    telemetry_id: options.telemetryId,
    started_hour: hourOf(now()),
    from_article: options.fromArticle,
    browser: options.browser,
    webmcp: { mode: "none", ot_token_present: false, tools_max: 0 },
    chat: {
      opened: false,
      turns: 0,
      iterations: 0,
      stopped_by: { done: 0, limit: 0, abort: 0 },
      model_latency_ms_bucket: {},
    },
    tools: {},
    external_tool_calls: 0,
    declarative_activated: 0,
    scenarios: {},
    order: { staged: 0, confirmed_by_user: 0 },
    lab: { hint_ignored: false, description_lang: "ja" },
  };

  const bucket = (ms: number): string => (ms < 2_000 ? "<2s" : ms < 5_000 ? "2-5s" : "5s+");

  const api = {
    summary,

    markChatOpened() {
      summary.chat.opened = true;
    },

    markTurn(stoppedBy: "done" | "limit" | "abort", iterations: number, latencyMs: number) {
      summary.chat.turns += 1;
      summary.chat.iterations += iterations;
      summary.chat.stopped_by[stoppedBy] += 1;
      const key = bucket(latencyMs);
      summary.chat.model_latency_ms_bucket[key] =
        (summary.chat.model_latency_ms_bucket[key] ?? 0) + 1;
    },

    markTool(name: string, outcome: { ok: true } | { error: string }) {
      const stat = (summary.tools[name] ??= { ok: 0, err: {} });
      if ("ok" in outcome) stat.ok += 1;
      else stat.err[outcome.error] = (stat.err[outcome.error] ?? 0) + 1;
    },

    markWebmcp(mode: Summary["webmcp"]["mode"], otTokenPresent: boolean, toolsMax: number) {
      summary.webmcp = {
        mode,
        ot_token_present: otTokenPresent,
        tools_max: Math.max(summary.webmcp.tools_max, toolsMax),
      };
    },

    markOrderStaged() {
      summary.order.staged += 1;
    },

    markOrderConfirmed() {
      summary.order.confirmed_by_user += 1;
    },

    markScenario(id: string, result: "pass" | "fail") {
      summary.scenarios[id] = result;
    },

    markLab(lab: Summary["lab"]) {
      summary.lab = lab;
    },

    /** 送信。無効か未同意なら何もしない */
    flush(): boolean {
      if (!shouldSend({ enabled: options.enabled, statsConsent: options.consent() })) return false;
      send(ENDPOINT, JSON.stringify(summary));
      return true;
    },

    /** 60 秒ごとと、タブが隠れたときに送る。戻り値で後片付けする */
    start(): () => void {
      const timer = setInterval(() => api.flush(), SEND_INTERVAL_MS);
      const onHidden = () => {
        if (document.visibilityState === "hidden") api.flush();
      };
      document.addEventListener("visibilitychange", onHidden);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onHidden);
      };
    },
  };

  return api;
}
