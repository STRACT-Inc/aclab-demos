// UCP の署名(RFC 9421 HTTP Message Signatures、ES256)。
// 仕様: https://ucp.dev/2026-08-25/specification/signatures/
import { createHash, createPrivateKey, sign } from "node:crypto";

const SIGNATURE_LABEL = "sig1";

/** RFC 9530 の Content-Digest。JSON を正規化せず、送るバイト列そのものを SHA-256 にかける */
export function contentDigest(bodyBytes) {
  return `sha-256=:${createHash("sha256").update(bodyBytes).digest("base64")}:`;
}

export function ucpAgentHeader(profileUrl) {
  return `profile="${profileUrl}"`;
}

/**
 * 署名対象の文字列(signature base)を組み立てる。
 * components の順番は Signature-Input に書く順番と一致させる。検証側は同じ順で組み立て直す。
 */
export function buildSignatureBase({ method, url, headers, components, keyid }) {
  const target = new URL(url);
  const derived = {
    "@method": method.toUpperCase(),
    "@authority": target.host,
    "@path": target.pathname,
    "@query": target.search,
  };
  const params = `(${components.map((c) => `"${c}"`).join(" ")});keyid="${keyid}"`;
  const lines = components.map((c) => {
    const value = c.startsWith("@") ? derived[c] : headers[c];
    if (value === undefined || value === "") throw new Error(`missing value for component ${c}`);
    return `"${c}": ${value}`;
  });
  lines.push(`"@signature-params": ${params}`);
  return { base: lines.join("\n"), params };
}

/**
 * MCP の POST リクエストに付ける署名ヘッダーを返す。
 * idempotencyKey は状態を変える操作のときだけ渡す(渡したら署名対象に含める)。
 */
export function signRequest({ url, bodyBytes, profileUrl, idempotencyKey, privateJwk }) {
  const headers = {
    "content-type": "application/json",
    "content-digest": contentDigest(bodyBytes),
    "ucp-agent": ucpAgentHeader(profileUrl),
  };
  const components = ["@method", "@authority", "@path", "content-digest", "content-type", "ucp-agent"];
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
    components.push("idempotency-key");
  }
  const { base, params } = buildSignatureBase({
    method: "POST",
    url,
    headers,
    components,
    keyid: privateJwk.kid,
  });
  // Node の既定は DER。UCP は r と s を 32 バイトずつ並べた 64 バイトを要求するので ieee-p1363 を指定する
  const signature = sign("sha256", Buffer.from(base), {
    key: createPrivateKey({ key: privateJwk, format: "jwk" }),
    dsaEncoding: "ieee-p1363",
  });
  return {
    ...headers,
    "signature-input": `${SIGNATURE_LABEL}=${params}`,
    signature: `${SIGNATURE_LABEL}=:${signature.toString("base64")}:`,
  };
}
