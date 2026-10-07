import { parseSse } from "../../core/nlweb-sse.ts";

/**
 * NLWeb サーバへの接続。
 * 共有シークレットは中継だけが持つ。読者と Claude は Vercel 側の URL しか見ない。
 */
export interface NlwebUpstream {
  origin: string;
  secret: string;
  site: string;
  timeoutMs: number;
}

export const ASK_MODES = ["list", "summarize", "generate"] as const;
export type AskMode = (typeof ASK_MODES)[number];

/**
 * 参照実装の mode 値。docs は list と書くが、実装は none を既定にしている。
 * baseHandler は `mode` を、ルータは `generate_mode` を読むので両方に同じ値を送る(2026-09-28 実測)。
 */
const UPSTREAM_MODE: Record<AskMode, string> = { list: "none", summarize: "summarize", generate: "generate" };

/** 1 質問の上限。参照実装は 50 回以上 LLM を呼ぶので 10 秒では足りない */
const DEFAULT_TIMEOUT_MS = 55_000;

export function upstreamFromEnv(env: Record<string, string | undefined> = process.env): NlwebUpstream {
  const origin = env.NLWEB_ORIGIN;
  if (!origin) {
    throw new Error("NLWEB_ORIGIN が未設定です(例: https://nlweb-server.up.railway.app)");
  }
  const timeout = env.NLWEB_TIMEOUT_MS ? Number.parseInt(env.NLWEB_TIMEOUT_MS, 10) : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`NLWEB_TIMEOUT_MS は正の整数で指定してください(受け取った値: ${env.NLWEB_TIMEOUT_MS})`);
  }
  return {
    origin: origin.replace(/\/$/, ""),
    secret: env.NLWEB_SHARED_SECRET ?? "",
    site: env.NLWEB_SITE ?? "aclab",
    timeoutMs: timeout,
  };
}

export interface AskParams {
  query: string;
  prev?: string[];
  mode?: AskMode;
}

export function askUrl(up: NlwebUpstream, params: AskParams): string {
  const mode = UPSTREAM_MODE[params.mode ?? "list"];
  const search = new URLSearchParams({
    query: params.query,
    site: up.site,
    mode,
    generate_mode: mode,
  });
  if (params.prev && params.prev.length > 0) search.set("prev", params.prev.join(","));
  return `${up.origin}/ask?${search.toString()}`;
}

function authHeaders(up: NlwebUpstream): Record<string, string> {
  return up.secret ? { authorization: `Bearer ${up.secret}` } : {};
}

/**
 * `/ask` を SSE で読み切り、data 行の辞書を返す。
 * 非ストリーミング応答は details / compare の中身を落とすので使わない。
 */
export async function askUpstream(
  up: NlwebUpstream,
  params: AskParams,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>[]> {
  const response = await fetchImpl(askUrl(up, params), {
    headers: { accept: "text/event-stream", ...authHeaders(up) },
    signal: AbortSignal.timeout(up.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`upstream /ask returned ${response.status}`);
  }
  return parseSse(await response.text());
}

/** `/mcp` は単一 POST の JSON-RPC。本文はそのまま渡し、応答もそのまま返す */
export async function mcpUpstream(
  up: NlwebUpstream,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(`${up.origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...authHeaders(up),
    },
    body,
    signal: AbortSignal.timeout(up.timeoutMs),
  });
}
