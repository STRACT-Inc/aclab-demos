/**
 * Origin Trial のトークン。
 * ヘッダー(next.config.ts)と meta の両方で配る。meta は CDN のヘッダー設定ミスに
 * 対する保険で、App Router の Metadata API は http-equiv を出さないため、
 * ルートレイアウトの <head> に直接書く。
 */

/** トークンは Base64 の JSON ペイロードを持つ。失効日を読むために覗く */
export interface OriginTrialToken {
  origin: string;
  feature: string;
  /** 失効日時(UNIX 秒) */
  expiry: number;
}

/** Chrome / Edge のトークン。デプロイの環境変数から入る */
export function originTrialTokens(): string[] {
  return [process.env.NEXT_PUBLIC_OT_TOKEN_CHROME, process.env.NEXT_PUBLIC_OT_TOKEN_EDGE]
    .filter((token): token is string => Boolean(token && token.trim()))
    .map((token) => token.trim());
}

/**
 * トークンをデコードして失効日を読む(/lab の表示と、失効の監視に使う)。
 * 形式: 先頭 69 バイトが署名とバージョン、そのあとに JSON のペイロードが続く。
 * ★形式は Chrome の OT ドキュメントで再確認する。読めなければ null を返す。
 */
export function decodeToken(token: string): OriginTrialToken | null {
  try {
    const binary = atob(token);
    const start = binary.indexOf("{");
    const end = binary.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const payload = JSON.parse(binary.slice(start, end + 1)) as Partial<OriginTrialToken>;
    if (!payload.origin || !payload.feature || typeof payload.expiry !== "number") return null;
    return { origin: payload.origin, feature: payload.feature, expiry: payload.expiry };
  } catch {
    return null;
  }
}

/** 失効日を YYYY-MM-DD で返す。読めなければ null */
export function expiryDate(token: string): string | null {
  const decoded = decodeToken(token);
  return decoded ? new Date(decoded.expiry * 1000).toISOString().slice(0, 10) : null;
}
