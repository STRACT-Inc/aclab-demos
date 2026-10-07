// 実測ログから、ストアを特定できる値と資格情報を伏せる。
// 記事やリポジトリに貼る前提のログなので、書き出す時点で伏せておく。

const KEY_PARAM = /([?&]key=)[^&"\s\\]+/g;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/g;
const SIGNATURE_VALUE = /(sig1=:)[A-Za-z0-9+/=]+(:)/g;

export function redactText(text, { shopDomain, secrets = [] } = {}) {
  let out = text;
  for (const secret of secrets.filter(Boolean)) out = out.split(secret).join("{redacted}");
  if (shopDomain) out = out.split(shopDomain).join("{shop-domain}");
  return out
    .replace(KEY_PARAM, "$1{redacted}")
    .replace(BEARER, "$1{redacted}")
    .replace(SIGNATURE_VALUE, "$1{redacted}$2");
}

export function redactJson(value, options) {
  return JSON.parse(redactText(JSON.stringify(value), options));
}
