// 3 つの名乗り方ごとに、リクエストへ足すヘッダーを決める。
// 定義: https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting
import { TOKEN_ENDPOINT } from "./config.mjs";
import { signRequest } from "./signature.mjs";

let cachedToken = null;

/** JWT のペイロードを読む。署名の検証はしない(中身を記録するためだけに使う) */
export function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function fetchAccessToken(config, fetchImpl = fetch) {
  if (cachedToken) return cachedToken;
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`token endpoint returned ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  cachedToken = json.access_token;
  return cachedToken;
}

/**
 * ティアごとのヘッダーを返す。
 * anonymous は Authorization も署名も付けない。プロフィールの URL は本文の meta にだけ入る。
 */
export async function tierHeaders(tier, { config, url, bodyBytes, idempotencyKey }) {
  if (tier === "anonymous") return { "content-type": "application/json" };
  if (tier === "signed") {
    return signRequest({
      url,
      bodyBytes,
      profileUrl: config.profileUrl,
      idempotencyKey,
      privateJwk: config.signingKeyJwk,
    });
  }
  if (tier === "token") {
    // Token では Shopify-Buyer-IP が無いと HTTP 422 "Missing required buyer IP header" で弾かれる(実測)。
    // 公式ドキュメントの Checkout MCP のページとチュートリアルの例には載っていない
    return {
      "content-type": "application/json",
      authorization: `Bearer ${await fetchAccessToken(config)}`,
      ...(config.buyerIp ? { "shopify-buyer-ip": config.buyerIp } : {}),
    };
  }
  throw new Error(`unknown tier: ${tier}`);
}
