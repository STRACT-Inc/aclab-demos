import {
  checkRequestRate,
  clientIp,
  ipHash,
  takeDailyModelCall,
  type GuardConfig,
  type Logger,
  type Store,
} from "@aclab/demo-guard";
import { z } from "zod";
import { mcpUpstream, type NlwebUpstream } from "./nlweb.ts";

/**
 * `/mcp` の中継。
 * 参照実装の /mcp は単一 POST の JSON-RPC 2.0(SSE もセッション ID も無い)なので、本文を
 * そのまま渡せる。ここでは許可するメソッドを絞り、tools/call だけを数え、`ask` に site を補う。
 * 認証は掛けない。claude.ai のカスタムコネクタが OAuth 無しでつなげるようにするため。
 */

export const MCP_METHODS = ["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"] as const;
const ALLOWED = new Set<string>(MCP_METHODS);

const JSONRPC = "2.0";
const METHOD_NOT_FOUND = -32601;
const INVALID_REQUEST = -32600;
const PARSE_ERROR = -32700;
/** 参照実装に無いコード。上限に当たったことをクライアントに伝える */
const RATE_LIMITED = -32000;
const UPSTREAM_FAILED = -32001;

/** 本文の上限。tools/call の引数は短い質問だけのはず */
export const BODY_MAX_BYTES = 8_192;

const requestSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

type JsonRpcRequest = z.infer<typeof requestSchema>;

function rpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: JSONRPC, id: id ?? null, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: JSONRPC, id: id ?? null, result }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** `ask` の引数に site が無ければデモのサイトを補う。無指定は who_and_search に回り失敗する */
export function injectSite(request: JsonRpcRequest, site: string): JsonRpcRequest {
  if (request.method !== "tools/call") return request;
  const params = request.params ?? {};
  if (params.name !== "ask") return request;
  const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
  if (args.site !== undefined) return request;
  return { ...request, params: { ...params, arguments: { ...args, site: [site] } } };
}

export interface McpHandlerDeps {
  store: Store;
  config: GuardConfig;
  upstream: NlwebUpstream;
  log: Logger;
  /** 補わない条件と比べるときに false にする。既定 true */
  injectSite: boolean;
  fetchImpl?: typeof fetch;
}

export function createMcpHandler(deps: McpHandlerDeps): (req: Request) => Promise<Response> {
  const { store, config, upstream, log } = deps;
  return async (req) => {
    // 宣言された長さで先に断り、読んだ本文はバイト数で確かめる(文字数だと日本語で判定がずれる)
    const declared = Number.parseInt(req.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) {
      return rpcError(null, INVALID_REQUEST, "request too large", 413);
    }
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > BODY_MAX_BYTES) return rpcError(null, INVALID_REQUEST, "request too large", 413);

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return rpcError(null, PARSE_ERROR, "parse error", 400);
    }
    if (Array.isArray(json)) return rpcError(null, INVALID_REQUEST, "batch requests are not supported", 400);

    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) return rpcError(null, INVALID_REQUEST, "invalid request", 400);
    const request = parsed.data;

    if (!ALLOWED.has(request.method)) {
      return rpcError(request.id, METHOD_NOT_FOUND, `method not allowed: ${request.method}`);
    }

    // 参照実装は ping を知らず、通知に 200 でエラー本文を返す。仕様どおりの応答をここで作る
    if (request.method === "ping") return rpcResult(request.id, {});
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });

    if (request.method === "tools/call") {
      // ストアに届かないときは NLWeb を呼ばない(fail closed)
      try {
        const hash = ipHash(clientIp(req), config.ipHashSecret);
        const rate = await checkRequestRate(store, config, hash);
        if (!rate.ok) {
          log("mcp_rate_limited", { count: rate.count });
          return rpcError(request.id, RATE_LIMITED, "rate limited; try again later", 429);
        }
        const daily = await takeDailyModelCall(store, config);
        if (!daily.ok) {
          log("mcp_daily_cap", { count: daily.count });
          return rpcError(request.id, RATE_LIMITED, "daily cap reached; try again tomorrow", 429);
        }
      } catch {
        log("mcp_blocked", { reason: "store_unavailable" });
        return rpcError(request.id, UPSTREAM_FAILED, "store unavailable", 503);
      }
    }

    const forwarded = deps.injectSite ? injectSite(request, upstream.site) : request;
    const started = Date.now();
    try {
      const response = await mcpUpstream(upstream, JSON.stringify(forwarded), deps.fetchImpl);
      const body = await response.text();
      log("mcp_done", { method: request.method, status: response.status, ms: Date.now() - started });
      return new Response(body, {
        status: response.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      log("mcp_upstream_failed", {
        method: request.method,
        ms: Date.now() - started,
        reason: error instanceof Error ? error.name : "unknown",
      });
      return rpcError(request.id, UPSTREAM_FAILED, "upstream unavailable", 502);
    }
  };
}
