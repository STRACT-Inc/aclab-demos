/** ブラウザの保存キー。「リセット」はここに並ぶものを全部消す */
export const STORAGE_KEYS = {
  cart: "aclab.cart.v1",
  orders: "aclab.orders.v1",
  session: "aclab.session.v1",
  seen: "aclab.seen.v1",
  chat: "aclab.chat.v1",
  lab: "aclab.lab.v1",
  consent: "aclab.consent.v1",
  checkout: "aclab.checkout.v1",
  /** 記事から来たか(統計の from_article。送信はフェーズ 4 で足す) */
  entry: "aclab.entry.v1",
  /** BYO キー。sessionStorage にだけ置く。chat/byo-key.ts と同じ名前 */
  byoKey: "aclab.byokey.v1",
} as const;

/**
 * チャットの同意文の版。文面を変えたら上げる(古い同意は無効になり、同意パネルが出直す)。
 * 収録スクリプト(harness/record.ts)が同意済みの状態を作るときにも使う
 */
export const CONSENT_VERSION = "2026-09";
