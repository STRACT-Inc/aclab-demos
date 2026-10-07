/**
 * サーバのログ。
 * 出してよいのは件数・エラーコード・所要時間だけで、発話本文やツールの引数・結果は出さない。
 * 呼び出し側がうっかり渡しても値の形で弾く(フェーズ 0 のテストでこの性質を確かめる)。
 */

export type LogValue = string | number | boolean;

/** ログに出してよい文字列。識別子・コード・短い列挙値だけを通す */
const SAFE_VALUE = /^[\w.:/-]{1,40}$/;
/** ログのキー */
const SAFE_KEY = /^[a-z][a-z0-9_]{0,23}$/;
/** 弾いた値の代わりに出す印 */
export const DROPPED = "[dropped]";

export function sanitize(fields: Record<string, unknown>): Record<string, LogValue> {
  const out: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_KEY.test(key)) continue;
    if (typeof value === "number") {
      out[key] = Number.isFinite(value) ? value : 0;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = SAFE_VALUE.test(value) ? value : DROPPED;
    } else {
      out[key] = DROPPED;
    }
  }
  return out;
}

export type Logger = (event: string, fields?: Record<string, unknown>) => void;

/** 既定のロガー。1 行 1 JSON で出す(Vercel のログで読める形) */
export const consoleLogger: Logger = (event, fields = {}) => {
  console.log(JSON.stringify({ event, ...sanitize(fields) }));
};
