/**
 * 参照実装の版と、このデモが当てた変更。
 * /lab の表示、計測の環境表(results/env.json)、デプロイ確認が同じ値を使う。
 */
export const NLWEB_META = {
  repo: "https://github.com/nlweb-ai/NLWeb",
  sha: "b423f15d9aeaa023ce75993ac9deed2354597043",
  shaDate: "2026-06-10",
  /** 参照実装の API バージョン文字列(core/utils/message_senders.py) */
  apiVersion: "0.55",
  patches: [
    {
      id: "P1",
      file: "AskAgent/python/llm_providers/anthropic.py",
      why: "user 先頭のメッセージ、temperature を送らない、thinking を明示、text ブロックを選んで読む",
    },
    {
      id: "P2",
      file: "AskAgent/python/core/llm.py",
      why: "high レベル呼び出しの既定(8 秒・512 トークン)を環境変数で引き上げる。日本語の details / compare が切れるため",
    },
    {
      id: "P4",
      file: "AskAgent/python/webserver/middleware/auth.py",
      why: "共有シークレットの厳密一致。/ask も保護する(参照実装は空でない Bearer を何でも通す)",
    },
  ],
  embeddingModel: "gemini-embedding-001 (Gemini)",
  vectorStore: "Qdrant (local file mode)",
  site: "aclab",
  tools: ["ask", "list_sites", "who"],
} as const;
