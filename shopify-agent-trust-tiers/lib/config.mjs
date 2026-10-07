export const TIERS = ["anonymous", "signed", "token"];

// Shopify がチュートリアル用に公開しているプロフィール。cart と checkout の両方を宣言している
export const EXAMPLE_PROFILE_URL =
  "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/cart-and-checkout.json";

export const TOKEN_ENDPOINT = "https://api.shopify.com/auth/access_token";

const TIER_ENV = {
  anonymous: [],
  signed: ["UCP_SIGNING_KEY_JWK", "AGENT_PROFILE_URL"],
  token: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
};

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. See env.example`);
  return value;
}

export function loadConfig(env = process.env) {
  const shopDomain = required(env, "SHOP_DOMAIN").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return {
    env,
    shopDomain,
    endpoint: `https://${shopDomain}/api/ucp/mcp`,
    variantId: required(env, "VARIANT_ID"),
    addressCountry: env.ADDRESS_COUNTRY || "JP",
    profileUrl: env.AGENT_PROFILE_URL || EXAMPLE_PROFILE_URL,
    signingKeyJwk: env.UCP_SIGNING_KEY_JWK ? JSON.parse(env.UCP_SIGNING_KEY_JWK) : null,
    clientId: env.SHOPIFY_CLIENT_ID || null,
    clientSecret: env.SHOPIFY_CLIENT_SECRET || null,
    buyerIp: env.BUYER_IP || null,
  };
}

/**
 * そのティアで名乗るのに足りない環境変数を返す。空配列なら実行できる。
 * Signed は AGENT_PROFILE_URL も必須にしている。署名の検証には公開鍵を載せた自分のプロフィールが要り、
 * 既定で使う Shopify の例のプロフィールには自分の鍵が無いため。
 */
export function missingFor(tier, config) {
  return TIER_ENV[tier].filter((name) => !config.env[name]);
}

/** ログから伏せる値の一覧 */
export function secretsOf(config) {
  return [config.clientSecret, config.clientId, config.signingKeyJwk?.d];
}
