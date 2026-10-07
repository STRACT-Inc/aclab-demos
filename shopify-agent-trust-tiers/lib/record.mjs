// 実測結果を伏せ字にして JSONL に書き出し、端末には比較しやすい表で出す。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secretsOf } from "./config.mjs";
import { redactJson } from "./redact.mjs";

export function writeResults(name, observations, config) {
  const redacted = redactJson(observations, { shopDomain: config.shopDomain, secrets: secretsOf(config) });
  mkdirSync("results", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join("results", `${name}-${stamp}.jsonl`);
  writeFileSync(file, `${redacted.map((o) => JSON.stringify(o)).join("\n")}\n`);
  return file;
}

/** 1 回の呼び出しを、表の 1 行にする */
export function toRow(o) {
  return {
    tier: o.tier,
    tool: o.tool,
    http: o.httpStatus ?? "",
    ms: o.ms ?? "",
    outcome: o.skipped
      ? `skipped: ${o.skipped}`
      : o.rpcError
        ? `rpc ${o.rpcError.code}: ${o.rpcError.message}`
        : [o.status, ...(o.messages ?? []).map((m) => m.code)].filter(Boolean).join(" / ") ||
          // 本文が JSON-RPC でない拒否(ストアのパスワード保護など)は、HTTP の状態でしか分からない
          (o.httpStatus >= 400 ? "refused before MCP (no JSON-RPC body)" : "ok"),
    retryAfter: o.rateHeaders?.["retry-after"] ?? "",
  };
}
