# @aclab/demo-guard

デモ EC のサーバ側(セッション発行・LLM 中継・ガード・統計の受け口)。
話題ごとのデモ(`demos/*`)はこのパッケージを共有し、`app/api/*/route.ts` から呼ぶだけにする。

## 使い方

```ts
// demos/<name>/app/api/chat/route.ts
import { anthropicModelClient, createChatHandler, loadConfig, storeFromEnv, memoryStore } from "@aclab/demo-guard";

const config = loadConfig();
const store = storeFromEnv() ?? memoryStore(); // 本番は Upstash、ローカルはメモリ
const handler = createChatHandler({
  store,
  config,
  model: anthropicModelClient(),
  systemPrompt: SYSTEM_PROMPT, // デモごとに固定の文字列(毎回同じバイト列にする)
});

export const POST = handler;
```

ツールの実行はページ側で行う。このパッケージはモデルを 1 回呼んでストリームを返すだけで、
ツールを実行しない。

## 環境変数

| 変数 | 既定 | 説明 |
|---|---|---|
| `DEMO_NAME` | `demo` | ストアのキーの接頭辞。デモごとに変える(例: `webmcp`) |
| `CHAT_ENABLED` | `true` | チャットのキルスイッチ。`false` でセッション発行と中継を閉じる |
| `TELEMETRY_ENABLED` | `false` | 統計の受け付け。公開時は `false` |
| `ANTHROPIC_API_KEY` | – | デモ専用ワークスペースのキー(利用上限つき) |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | 記事の再現性のため、日付付きのスナップショットを既定にする |
| `IP_HASH_SECRET` | 開発用の固定値 | レート制限の IP ハッシュの鍵。本番では必須(未設定なら起動時に落ちる) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | – | ストアの接続情報。`KV_REST_API_URL` / `KV_REST_API_TOKEN` でも読む |
| `GUARD_*` | `src/config.ts` の `DEFAULTS` | 上限値。`GUARD_DAILY_MODEL_CALLS`、`GUARD_TURNS_PER_SESSION` など |

★ Vercel の Marketplace 連携がどの変数名で接続情報を入れるかは、つないだ時点で確認してこの表を直す。

## ストア

`Store` は 6 つのメソッドだけを持つ小さな取り決めで、実装は 2 つ。

- `memoryStore()` — テストとローカル。関数インスタンスをまたげないので本番では使わない
- `upstashStore(redis)` / `storeFromEnv()` — 本番。カウンタは Lua で `INCR` + `EXPIRE` を 1 往復にする

チャットはストアに届かないときに止まる(`/api/session` と `/api/chat` が 503)。日次上限を
数えられないまま Anthropic を呼ばないため。統計は逆に、届かなければ捨てて 204 を返す。

## テスト

```bash
pnpm --filter @aclab/demo-guard test
```

フェーズ 0 の受け入れ条件をこのテストで押さえている。

- `TELEMETRY_ENABLED=false` のとき `/api/telemetry` が 404 を返し、何も保存しない
- カタログに無いツール名・サイズ超過を受け取らない
- 同じストアを共有する 2 つのハンドラの合計で日次上限に達する
- ストアに届かないときモデルを呼ばない
- ログに発話本文とツールの引数・結果が出ない
