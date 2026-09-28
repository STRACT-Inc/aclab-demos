import { createHmac } from "node:crypto";

/** JST は UTC+9 で固定(サマータイムが無い) */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST の日付 YYYY-MM-DD。日次上限の区切りと、IP ハッシュの日替わりに使う */
export function jstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** JST の年月 YYYY-MM。統計の要約のキーに使う */
export function jstMonth(now: Date = new Date()): string {
  return jstDate(now).slice(0, 7);
}

/**
 * レート制限のキーに使う IP のハッシュ。
 * 日付を入力に混ぜるので、ソルトを保存しなくても毎日値が変わる。ハッシュはレート制限の
 * キーにしか現れず、TTL は最長 1 時間で消える。
 */
export function ipHash(ip: string, secret: string, date: string = jstDate()): string {
  return createHmac("sha256", secret)
    .update(`${date}:${ip}`)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * リクエストの送信元 IP。Vercel は x-forwarded-for の先頭に読者の IP を入れる。
 * 取れない場合も 1 つの値にまとめ、レート制限が素通りしないようにする。
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}
