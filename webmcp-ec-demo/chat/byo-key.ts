"use client";

/**
 * BYO キーモード。
 * 読者が自分の Anthropic API キーを入れると、ラボのサーバを経由せずブラウザから
 * 直接 API を呼ぶ。日次上限に達した読者の逃げ道として案内する。
 *
 * **公開時は出さない。** 外部送信規律の確認が済むまで隠す。
 * ビルド時のフラグが立っていないと、UI も送信経路も存在しない。
 *
 * キーの扱い:
 * - `sessionStorage` にだけ置く。タブを閉じれば消える
 * - ラボのサーバへは送らない。送り先は `api.anthropic.com` だけ
 * - ログにも統計にも入れない
 */

export const BYO_KEY_ENABLED = process.env.NEXT_PUBLIC_BYO_KEY_ENABLED === "true";

/** リセットで消せるように state/keys.ts と同じ名前にしてある */
const STORAGE_KEY = "aclab.byokey.v1";

/** 見た目だけの検査。正しさは最初の呼び出しで分かる */
export const looksLikeKey = (value: string): boolean => /^sk-ant-[\w-]{20,}$/.test(value.trim());

export function readByoKey(): string | null {
  if (!BYO_KEY_ENABLED || typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeByoKey(key: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    /* 保存できない設定では BYO キーを使えない */
  }
}

export function clearByoKey(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 消せなくてもタブを閉じれば消える */
  }
}
