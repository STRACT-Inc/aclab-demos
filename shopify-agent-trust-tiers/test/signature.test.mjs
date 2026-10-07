import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { buildSignatureBase, signRequest } from "../lib/signature.mjs";

const URL_ = "https://shop.example.com/api/ucp/mcp";
const PROFILE = "https://agent.example/.well-known/ucp";
const BODY = Buffer.from('{"jsonrpc":"2.0"}');

function newKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { publicKey, privateJwk: { kid: "test-key", ...privateKey.export({ format: "jwk" }) } };
}

test("should_list_components_in_signature_input_order_and_end_with_params", () => {
  const input = {
    method: "post",
    url: URL_,
    headers: { "content-type": "application/json", "ucp-agent": `profile="${PROFILE}"` },
    components: ["@method", "@authority", "@path", "content-type", "ucp-agent"],
    keyid: "k1",
  };
  const expected = [
    '"@method": POST',
    '"@authority": shop.example.com',
    '"@path": /api/ucp/mcp',
    '"content-type": application/json',
    `"ucp-agent": profile="${PROFILE}"`,
    '"@signature-params": ("@method" "@authority" "@path" "content-type" "ucp-agent");keyid="k1"',
  ].join("\n");

  assert.equal(buildSignatureBase(input).base, expected);
});

test("should_sign_idempotency_key_only_when_the_operation_has_one", () => {
  const { privateJwk } = newKey();
  const cases = [
    { idempotencyKey: undefined, signed: false },
    { idempotencyKey: "550e8400-e29b-41d4-a716-446655440000", signed: true },
  ];

  for (const { idempotencyKey, signed } of cases) {
    const headers = signRequest({ url: URL_, bodyBytes: BODY, profileUrl: PROFILE, idempotencyKey, privateJwk });
    assert.equal(headers["signature-input"].includes('"idempotency-key"'), signed);
    assert.equal("idempotency-key" in headers, signed);
  }
});

test("should_emit_raw_64_byte_signature_that_the_published_key_verifies", () => {
  const { publicKey, privateJwk } = newKey();
  const headers = signRequest({ url: URL_, bodyBytes: BODY, profileUrl: PROFILE, privateJwk });

  const signature = Buffer.from(headers.signature.match(/^sig1=:(.+):$/)[1], "base64");
  const { base } = buildSignatureBase({
    method: "POST",
    url: URL_,
    headers,
    components: ["@method", "@authority", "@path", "content-digest", "content-type", "ucp-agent"],
    keyid: "test-key",
  });

  // DER なら 70 バイト前後になる。UCP が求めるのは r と s を並べた 64 バイト
  assert.equal(signature.length, 64);
  assert.ok(
    verify("sha256", Buffer.from(base), { key: publicKey, dsaEncoding: "ieee-p1363" }, signature),
  );
});
