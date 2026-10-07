// Shopify の UCP MCP エンドポイントを 1 回呼び、ティアの差を比べるのに要る項目だけを記録する。
import { randomUUID } from "node:crypto";
import { tierHeaders } from "./tiers.mjs";

// meta["idempotency-key"] が必須のツール(Cart MCP / Checkout MCP のリファレンスより)
const NEEDS_IDEMPOTENCY_KEY = new Set(["cancel_cart", "complete_checkout", "cancel_checkout"]);

// レート制限の手がかりになるヘッダー。名前は実測で確かめるので、広めに拾う
const RATE_HEADER = /^(retry-after$|ratelimit|x-ratelimit|x-shopify-|x-request-id$)/i;

let nextId = 1;

/** Streamable HTTP は JSON か SSE のどちらでも返る。SSE なら最後の data 行を読む */
export function parseMcpBody(contentType, text) {
  if (!text) return null;
  let payload = text;
  if ((contentType || "").includes("text/event-stream")) {
    const data = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (data.length === 0) return null;
    payload = data[data.length - 1];
  }
  try {
    return JSON.parse(payload);
  } catch {
    return { unparsed: payload.slice(0, 500) };
  }
}

/** 応答から、ティアごとに変わりうる項目を抜き出す */
export function summarize(json) {
  if (!json) return {};
  if (json.error) {
    return { rpcError: { code: json.error.code, message: json.error.message, data: json.error.data } };
  }
  // 引数の検証エラーは structuredContent が無く、content[0].text に文章だけが入って返る(実測)
  if (json.result?.isError && !json.result.structuredContent) {
    const text = json.result.content?.find((c) => c.type === "text")?.text ?? "";
    return { isError: true, resource: null, id: null, status: null, continueUrl: null, totals: null,
      messages: [{ type: "error", code: "tool_error", severity: null, content: text }] };
  }
  const content = json.result?.structuredContent ?? {};
  const resource = content.checkout ?? content.cart ?? content;
  return {
    isError: json.result?.isError ?? false,
    resource: content.checkout ? "checkout" : content.cart ? "cart" : null,
    id: resource.id ?? null,
    status: resource.status ?? null,
    continueUrl: resource.continue_url ?? null,
    messages: (resource.messages ?? content.messages ?? []).map((m) => ({
      type: m.type,
      code: m.code,
      severity: m.severity,
      content: m.content,
    })),
    totals: resource.totals ?? null,
  };
}

export async function callTool({ config, tier, name, args = {}, fetchImpl = fetch }) {
  const idempotencyKey = NEEDS_IDEMPOTENCY_KEY.has(name) ? randomUUID() : undefined;
  const meta = { "ucp-agent": { profile: config.profileUrl } };
  if (idempotencyKey) meta["idempotency-key"] = idempotencyKey;

  // 署名は送るバイト列に対して計算するので、本文は一度だけバイト列にして使い回す
  const bodyBytes = Buffer.from(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: nextId++,
      params: { name, arguments: { meta, ...args } },
    }),
  );
  const headers = {
    accept: "application/json, text/event-stream",
    ...(await tierHeaders(tier, { config, url: config.endpoint, bodyBytes, idempotencyKey })),
  };

  const at = new Date().toISOString();
  const t0 = performance.now();
  const res = await fetchImpl(config.endpoint, { method: "POST", headers, body: bodyBytes });
  const text = await res.text();
  const ms = Math.round(performance.now() - t0);

  const json = parseMcpBody(res.headers.get("content-type"), text);
  const rateHeaders = Object.fromEntries([...res.headers].filter(([key]) => RATE_HEADER.test(key)));
  return { at, tier, tool: name, httpStatus: res.status, ms, rateHeaders, ...summarize(json), raw: json };
}
