#!/usr/bin/env node
/**
 * Signed で名乗るための ES256 の鍵と、公開鍵を載せた UCP プロフィールを作る。
 *
 *   pnpm gen-key [--kid <key id>] [--out <path>]
 *
 * 公開鍵入りのプロフィールを ucp-profile.json に書く。このファイルは公開して、その URL を AGENT_PROFILE_URL に入れる。
 * このデモでは公開リポジトリから raw.githubusercontent.com 経由で配信している(README を参照)。
 * 秘密鍵は標準出力に 1 行で出すので、UCP_SIGNING_KEY_JWK に入れる。ファイルには書かない。
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { kid: { type: "string" }, out: { type: "string", default: "ucp-profile.json" } } });
const kid = values.kid ?? `agent-${new Date().toISOString().slice(0, 10)}`;

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicJwk = { kid, ...publicKey.export({ format: "jwk" }), use: "sig", alg: "ES256" };
const privateJwk = { kid, ...privateKey.export({ format: "jwk" }) };

// cart と checkout の両方を宣言する。カートを checkout に変換するには両方の交渉が要る
const profile = {
  ucp: {
    version: "2026-08-25",
    capabilities: {
      "dev.ucp.shopping.cart": [{ version: "2026-08-25" }],
      "dev.ucp.shopping.checkout": [{ version: "2026-08-25" }],
    },
  },
  keys: [publicJwk],
};

writeFileSync(values.out, `${JSON.stringify(profile, null, 2)}\n`);

console.error(`wrote ${values.out} (publish this file, then set AGENT_PROFILE_URL to its URL)`);
console.error("add the next line to .env:");
console.log(`UCP_SIGNING_KEY_JWK=${JSON.stringify(privateJwk)}`);
