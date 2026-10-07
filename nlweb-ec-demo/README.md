# NLWeb のデモ EC

架空の EC サイトに NLWeb(Microsoft が公開した、サイトの構造化データから会話検索と MCP サーバを作るオープンソースの仕組み)を組み込んだデモです。記事「[NLWeb とは何か。商品の構造化データから会話検索を作って分かったこと](https://agentic-commerce-lab.jp/articles/nlweb-ec-demo)」で使いました。動いているものは https://nlweb.demo.agentic-commerce-lab.jp で触れます。

商品ページは schema.org の `Product` を JSON-LD で出し、NLWeb のサーバはそれを索引に取り込みます。人は `/ask`(会話検索の画面)から、AI は `/mcp`(MCP サーバ)から、同じ索引に質問します。サイトの `/api/ask` と `/mcp` は NLWeb への中継で、共有シークレットと回数制限を足しています。

## 手元で動かす

Docker、Node.js 22 以上、pnpm と、Anthropic と Gemini の API キーが要ります。

1. NLWeb のサーバを `server/` で起動します(手順は `server/README.md`)。共有シークレットはここでは `local` にします
2. サイトを起動します

```sh
# bash / zsh
pnpm install
NLWEB_ORIGIN=http://127.0.0.1:8000 NLWEB_SHARED_SECRET=local pnpm dev   # http://localhost:3300
pnpm test
pnpm typecheck
```

```fish
# fish
pnpm install
env NLWEB_ORIGIN=http://127.0.0.1:8000 NLWEB_SHARED_SECRET=local pnpm dev   # http://localhost:3300
pnpm test
pnpm typecheck
```

`pnpm dev` では、ストアの接続情報(下表の `UPSTASH_REDIS_REST_URL` など)が無ければメモリ実装で動きます。本番(`NODE_ENV=production`)でストアに届かないときは、中継は NLWeb を呼ばずに 503 を返します。

## 環境変数

上限値などの残りは `packages/demo-guard/README.md` にあります。

| Variable | Default | Purpose |
|---|---|---|
| `NLWEB_ORIGIN` | (required) | Origin of the NLWeb server, e.g. `http://127.0.0.1:8000` |
| `NLWEB_SHARED_SECRET` | empty | Bearer token the proxy sends; must equal the server's value |
| `NLWEB_SITE` | `aclab` | `site` forwarded to `/ask` and added to MCP `ask` calls that omit it |
| `NLWEB_TIMEOUT_MS` | `55000` | Upstream timeout per request |
| `ASK_ENABLED` | `true` | Kill switch for `/api/ask` |
| `MCP_SITE_INJECT` | `true` | Set `false` to compare with a proxy that does not add `site` |
| `GUARD_REQUEST_RATE_LIMIT` / `GUARD_REQUEST_RATE_WINDOW_SECONDS` | `30` / `600` | Per-IP cap for `/api/ask` and `/mcp tools/call` (the public demo uses `10` / `600`) |
| `GUARD_DAILY_MODEL_CALLS` | `2000` | Global daily cap counted per question (the public demo uses `200`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | (none) | Store for the limits; in-memory under `pnpm dev` when unset |
| `DEMO_NAME` | `demo` | Store key prefix |
| `IP_HASH_SECRET` | dev fixed value | Key for hashing IPs in the rate limits; required in production |
| `CHAT_ENABLED` | `true` | Unused here (this demo has no chat API); set `false` |
| `TELEMETRY_ENABLED` | `false` | Keep `false` |

## 構成

```
app/ask                  conversational search UI (calls /api/ask)
app/api/ask              guarded proxy to NLWeb /ask
app/mcp                  guarded JSON-RPC proxy to NLWeb /mcp
app/products/[id]        product page, Product JSON-LD (layout.tsx) and the image.svg route
app/sitemap.ts           24 product URLs and the top page (the NLWeb crawler reads this)
app/lab                  pinned NLWeb commit, patches, limits, curl samples, raw tools/list
core/jsonld.ts           Product JSON-LD builder (the pages and server/data/products.jsonl share it)
core/nlweb-response.ts   turns NLWeb's messages into what the UI shows
server/                  NLWeb server image: Dockerfile, overrides, patches, config, data
packages/                demo-guard (proxy limits, store, sessions) and config
test/                    node --test tests
```

このディレクトリは開発用リポジトリからの写しです。記事の数字を取った計測ハーネスと実測データは含めていません。Pull Request はこのリポジトリでは受け付けていないので、気付いたことは Issues へお願いします。
