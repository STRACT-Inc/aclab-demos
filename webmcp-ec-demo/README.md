# WebMCP のデモ EC

試験提供中の WebMCP(`document.modelContext`)を架空の EC サイトに実装したデモです。記事「[WebMCP とは何か。EC サイトに実装して分かった、ツール設計の勘所](https://agentic-commerce-lab.jp/articles/webmcp-ec-demo)」で使いました。動いているものは https://webmcp.demo.agentic-commerce-lab.jp で触れます。

ページがカート・検索・注文などのツールを `document.modelContext` に登録し、ブラウザ側の AI(Chrome の Origin Trial)やページ内チャットがそれを呼びます。`place_order` は確認シートを開くだけで注文を作らず、確定ボタンのハンドラだけが注文を書き込みます。商品レビューには注入を 3 件仕込んであります(`docs/README.md`)。

## 手元で動かす

Node.js 22 以上と pnpm が必要です。

```sh
pnpm install
pnpm dev         # http://localhost:3200
pnpm test        # core・chat・webmcp のテスト
pnpm typecheck
```

チャットにモデルを使わせるには `ANTHROPIC_API_KEY` を環境変数で渡します。設定しなくてもサイトとツール登録は動きます。ストアの接続情報(下表)が無ければローカルではメモリ実装に切り替わります。

Chrome で `document.modelContext` を有効にするには、Origin Trial のトークンを自分のオリジン向けに取得して `NEXT_PUBLIC_OT_TOKEN_CHROME` に入れるか、`chrome://flags` で WebMCP を有効にします。トークンが無いときはポリフィル(`@mcp-b/webmcp-polyfill`)で動きます。ヘッダー右のバッジが動作モード(native / polyfill / 利用不可)です。

## 環境変数

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | ページ内チャットが呼ぶモデルのキー。無ければチャットは応答しない |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | チャットのモデル |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | (none) | セッションと上限のストア。無ければメモリ実装 |
| `IP_HASH_SECRET` | dev fixed value | レート制限用の IP ハッシュの鍵。本番では必須 |
| `NEXT_PUBLIC_OT_TOKEN_CHROME` / `NEXT_PUBLIC_OT_TOKEN_EDGE` | (none) | Origin Trial のトークン。ヘッダーと meta の両方で配る |
| `NEXT_PUBLIC_BYO_KEY_ENABLED` | `false` | 利用者が自分のキーを入れてブラウザから直接モデルを呼ぶモード |
| `NEXT_PUBLIC_TELEMETRY_ENABLED` / `TELEMETRY_ENABLED` | `false` | 統計の同意 UI と受け口 |

上限値などの残りは `packages/demo-guard/README.md` にあります。

## 構成

```
app/          ページと API(app/api/*/route.ts は demo-guard を呼ぶだけ)
core/         検索・カート・クーポン・注文・規約。DOM を触らない
data/         架空の商品・レビュー・規約・クーポン・注文履歴
state/        ブラウザの状態(localStorage / sessionStorage)
chat/         ページ内チャットとループ。ツールの実行は webmcp/executor.ts に委ねる
components/   ヘッダー・フッター・商品カード・チャットの取り付け・動作モードのバッジ
webmcp/       document.modelContext の検出(detect)・互換層(compat)・ツールの定義と登録(tools / registry)・
              Origin Trial トークン・ページに合わせて出し入れするフック(use-webmcp)
packages/     demo-guard(サーバ側のセッション発行・LLM 中継・上限)、demo-contract(対応判定の型)、config
docs/         画面の写真 4 枚と説明
test/         node --test のテスト
scenarios.json / scenarios.ts  記事の検証シナリオ。チャットのチップ・deep link が同じ表を読む
system-prompt.ts  ページ内エージェントのシステムプロンプト
```

このディレクトリは開発用リポジトリからの写しです。記事の数字を取った計測ハーネスと実測データは含めていません。Pull Request はこのリポジトリでは受け付けていないので、気付いたことは Issues へお願いします。
