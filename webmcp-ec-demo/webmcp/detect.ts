import type { ModelContext } from "./types.ts";

/**
 * 検出と動作モード。
 * native が無ければ polyfill、それも無ければチャットを無効にする。
 * モードは画面に常時表示する。
 */

export type WebMcpMode = "native" | "polyfill" | "none";

export const MODE_LABELS: Record<WebMcpMode, string> = {
  native: "native(Origin Trial)",
  polyfill: "polyfill",
  none: "利用不可",
};

let detected: Promise<WebMcpMode> | null = null;

async function detect(): Promise<WebMcpMode> {
  if (typeof document === "undefined") return "none";

  // インターフェースの有無で見る。document.modelContext の参照だけだと、
  // Origin Trial が切れたページで undefined になる場合と区別できない
  if ("modelContext" in Document.prototype && document.modelContext) return "native";

  if (process.env.NEXT_PUBLIC_WEBMCP_POLYFILL === "on") {
    try {
      // polyfill は使うときだけ読む(native の読者のバンドルに入れない)
      const module = (await import("@mcp-b/webmcp-polyfill")) as {
        initializeWebMCPPolyfill?: () => void;
        default?: () => void;
      };
      const initialize = module.initializeWebMCPPolyfill ?? module.default;
      initialize?.();
      return document.modelContext ? "polyfill" : "none";
    } catch {
      // polyfill を読めない環境でもデモの買い物は続けられる
      return "none";
    }
  }

  return "none";
}

/** 1 回だけ判定し、結果を使い回す */
export function detectWebMcp(): Promise<WebMcpMode> {
  return (detected ??= detect());
}

/** 判定後の modelContext。none のときは null */
export function modelContext(): ModelContext | null {
  // ブラウザの外(SSR・テスト・ヘッドレスの計測)では document ごと無い
  if (typeof document === "undefined") return null;
  return document.modelContext ?? null;
}

/**
 * Origin Trial のトークンがこのページに配られているか。
 * ヘッダーと meta の両方で配るので、meta の有無で見る。
 */
export function otTokenPresent(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('meta[http-equiv="origin-trial"]') !== null;
}
