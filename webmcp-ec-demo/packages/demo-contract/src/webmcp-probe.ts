import { z } from "zod";

/**
 * 記事ページ(本体サイト)とデモの `/probe` が交わす postMessage の取り決め。
 * 公開したデモは凍結するので、既存のフィールドは変えず追加だけを行う。受信側は
 * 古い送信側とも通じ続ける必要がある。
 */

/** メッセージの種別。受信側は event.origin と合わせて必ず検証する */
export const PROBE_MESSAGE_TYPE = "aclab-webmcp-probe";

/** 親ページが自分のオリジンを渡すクエリ名。/probe は許可リストと照合してから送り返す */
export const PROBE_PARENT_PARAM = "parent";

/** UA-CH のブランド 1 件(navigator.userAgentData.brands の要素) */
export const brandSchema = z
  .object({
    brand: z.string().max(64),
    version: z.string().max(16),
  })
  .strict();

/** `/probe` → 親ページ。判定結果だけを返し、サーバへは送らない */
export const probeMessageSchema = z
  .object({
    type: z.literal(PROBE_MESSAGE_TYPE),
    version: z.literal(1),
    /** このブラウザで document.modelContext が使えるか */
    native: z.boolean(),
    brands: z.array(brandSchema).max(16).default([]),
  })
  .strict();

export type ProbeMessage = z.infer<typeof probeMessageSchema>;
export type Brand = z.infer<typeof brandSchema>;

/**
 * 受信側のヘルパ。拡張機能や広告が投げる無関係な postMessage を落とす。
 * 呼び出し側は、これとは別に event.origin がデモのオリジンであることを確認する。
 */
export function parseProbeMessage(data: unknown): ProbeMessage | null {
  const parsed = probeMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** ブランド一覧から表示用のブラウザ名とメジャーバージョンを取る(W1 のバッジ用) */
export function readableBrand(brands: Brand[]): { name: string; major: number } | null {
  // "Not_A Brand" のような GREASE 値は除く
  const real = brands.filter((b) => !/not.*brand/i.test(b.brand));
  const preferred =
    real.find((b) => /edge/i.test(b.brand)) ??
    real.find((b) => /chrome/i.test(b.brand)) ??
    real[0];
  if (!preferred) return null;
  const major = Number.parseInt(preferred.version, 10);
  return { name: preferred.brand, major: Number.isFinite(major) ? major : 0 };
}
