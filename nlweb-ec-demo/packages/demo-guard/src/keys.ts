/**
 * ストアのキー。
 * 要約のキーには ip_hash も chat_session_id も入れず、レート制限とセッションのキーには
 * telemetry_id を入れない。同じ DB に置いても、両者をつなぐ値が無い状態を保つ。
 */

export const keys = {
  /** IP あたりのリクエスト */
  requestRate: (demo: string, ipHash: string) => `${demo}:rl:req:${ipHash}`,
  /** IP あたりのセッション発行 */
  sessionIssueRate: (demo: string, ipHash: string) => `${demo}:rl:session:${ipHash}`,
  /** IP あたりの統計の受信 */
  telemetryRate: (demo: string, ipHash: string) => `${demo}:rl:telemetry:${ipHash}`,
  /** 全体の日次モデル呼び出し(JST の日付で区切る) */
  dailyModelCalls: (demo: string, jstDate: string) => `${demo}:cap:model_calls:${jstDate}`,
  /** チャットのセッション予算。キーの失効がセッションの失効 */
  chatSession: (demo: string, chatSessionId: string) => `${demo}:chat:${chatSessionId}`,
  /** 統計の要約。同じ telemetry_id で上書きする */
  telemetrySummary: (demo: string, month: string, telemetryId: string) =>
    `${demo}:tlm:${month}:${telemetryId}`,
} as const;
