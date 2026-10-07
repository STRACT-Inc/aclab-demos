# Shopify の 3 つの信頼ティアを比べるスクリプト

記事: https://agentic-commerce-lab.jp/articles/shopify-agent-trust-tiers

Shopify の UCP MCP サーバーは、エージェントの名乗り方によってリクエストを Anonymous、Signed、Token の 3 つのティアに分けます([Auth and rate limiting](https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting))。このスクリプトは、同じ買い物の流れを名乗り方だけ変えて実行し、応答とレート制限の差を記録します。

| Tier | How the agent identifies itself |
|---|---|
| Anonymous | `Authorization` も署名も付けない |
| Signed | RFC 9421 の HTTP Message Signatures(ES256)。公開鍵は自分の UCP プロフィールに載せる |
| Token | Dev Dashboard で発行した API キーから取得した Bearer トークン |

## 前提

- Node.js 22 以上と pnpm
- パスワード保護を外した Shopify ストアと、そのストアにある商品バリアントの GID。パスワード保護中のストアでは `/api/ucp/mcp` が MCP に届く前に拒否されます。開発用ストアはパスワードを外せないため、有料プランのストアが必要です
- Signed を試す場合は、JSON ファイルを公開できる URL(プロフィールの置き場所)
- Token を試す場合は、[Dev Dashboard](https://dev.shopify.com/dashboard) の Catalogs で発行した API キー

リクエストは実在のストアに届きます。自分が管理するストアか、所有者が検証用と明示しているストアに対してだけ実行してください。

## 動かし方

```sh
pnpm install
cp env.example .env   # 値を入れる
pnpm test

# 3 つのティアで同じ流れを実行する。設定が足りないティアは飛ばす
node --env-file=.env scripts/run-flow.mjs
node --env-file=.env scripts/run-flow.mjs --tier anonymous
```

`run-flow` は `create_cart`、`get_cart`、`create_checkout`、`get_checkout` を順に呼び、最後に checkout とカートを取り消します。`--probe-complete` を付けると、支払い情報なしで `complete_checkout` も呼び、ティアごとの拒否のされ方を記録します。

### Signed の準備

```sh
pnpm gen-key
```

`ucp-profile.json` に、cart と checkout の capability と公開鍵を載せたプロフィールができます。このファイルを HTTPS で公開し、その URL を `.env` の `AGENT_PROFILE_URL` に入れます。標準出力に出る `UCP_SIGNING_KEY_JWK=...` の行は秘密鍵なので、`.env` にだけ書きます。

プロフィールの配信には条件があります(2026 年 10 月の実測)。

- `Content-Type` が `application/json` であること。`raw.githubusercontent.com` は `text/plain` で返すため使えません
- `Cache-Control` ヘッダーが付いていること。無いと Shopify はプロフィールを受け付けません
- 条件を満たさないとき、ストアの MCP は `HTTP signature error: key_not_found` を返します。原因が分かりにくいので、先に Global Catalog(`https://catalog.shopify.com/api/ucp/mcp`)へ同じプロフィールで `search_catalog` を送ると、`profile_malformed: Invalid content type` や `Invalid cache control` のように理由が返ります

GitHub Pages はこの条件を満たします。このデモのプロフィールは公開リポジトリの `github-pages/shopify-agent-trust-tiers/ucp-profile.json` にあり、GitHub Pages で `https://stract-inc.github.io/aclab-demos/shopify-agent-trust-tiers/ucp-profile.json` として配信しています。載っているのは公開鍵だけで、対になる秘密鍵は公開していません。自分で Signed を試すときは、`pnpm gen-key` で作り直したファイルを自分の管理する URL に置いてください。エージェントのプロフィールは店側の `/.well-known/ucp` と違い、固定のパスではなく任意の URL で指定できます。

署名の組み立てで注意する点が 1 つあります。状態を変えるツール(`create_cart`、`create_checkout`、`update_*`、`cancel_*`、`complete_checkout`)では、`Idempotency-Key` ヘッダーを付けて署名対象に含める必要があります。無いと `HTTP signature error: signature_missing` になります。`get_cart` のような読み取りでは不要です。

### レート制限を見る

```sh
node --env-file=.env scripts/probe-rate-limit.mjs --tier anonymous --max 30
```

カートを 1 つ作り、`get_cart` を続けて呼びます。HTTP 429 か `Retry-After` ヘッダーが返った時点で止まります。回数の上限は 200 です。

## 環境変数

| Variable | Required for | Purpose |
|---|---|---|
| `SHOP_DOMAIN` | all | 検証先のストアのドメイン |
| `VARIANT_ID` | all | カートに入れる商品バリアントの GID |
| `ADDRESS_COUNTRY` | (optional) | 見積もりに使う国コード。既定は `JP` |
| `AGENT_PROFILE_URL` | Signed | 自分の UCP プロフィールの URL。未設定なら Shopify が公開している例を使う |
| `UCP_SIGNING_KEY_JWK` | Signed | `pnpm gen-key` が出力する秘密鍵 |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | Token | Dev Dashboard の API キー |
| `BUYER_IP` | Token | 買い手の IP アドレス。`Shopify-Buyer-IP` ヘッダーとして送る。無いと Token の呼び出しは 422 で弾かれる |

## 出力

端末に呼び出しごとの表を出し、全文を `results/*.jsonl` に保存します。保存する時点で、ストアのドメイン、API キー、Bearer トークン、署名の値、URL の `key` パラメーターを伏せます。`results/` は git の対象外です。

## 構成

```
lib/config.mjs      環境変数の読み込みと、ティアごとに必要な設定
lib/tiers.mjs       ティアごとのヘッダー(Bearer トークンの取得を含む)
lib/signature.mjs   RFC 9421 の署名(Content-Digest、signature base、ES256)
lib/mcp.mjs         MCP の呼び出しと、応答から比べる項目の抜き出し
lib/redact.mjs      ログの伏せ字
lib/record.mjs      JSONL への保存と表の整形
scripts/            gen-key、run-flow、probe-rate-limit
test/               node --test のテスト
```
