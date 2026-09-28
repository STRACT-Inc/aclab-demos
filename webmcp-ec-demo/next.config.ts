import type { NextConfig } from "next";

/**
 * WebMCP デモ。
 * Origin Trial のトークンはヘッダーと meta の両方で配る。ヘッダーはここ、meta は
 * app/layout.tsx。片方が抜けても動くようにしておく。
 */

/**
 * Origin Trial のトークン(Chrome と Edge)。
 *
 * **1 つのヘッダー値にカンマ区切りで 2 枚を載せる。** 同じ key を 2 件返すと Next.js の
 * `headers()` が重複排除して最後の 1 枚(Edge 用)しか出ず、meta を持たない Route Handler
 * (`/probe`)が Chrome で Origin Trial の対象にならなかった(2026-09-17 に本番で確認。
 * 記事のバッジが全員に「使えません」と出る)。Chromium はヘッダー値をカンマと空白で
 * 区切ってトークンを読むので、1 値に並べれば 2 枚とも届く。`app/layout.tsx` と `/probe`
 * の meta は、CDN のヘッダー設定ミスに対する保険としてそのまま残す。
 */
const tokens = [process.env.NEXT_PUBLIC_OT_TOKEN_CHROME, process.env.NEXT_PUBLIC_OT_TOKEN_EDGE]
  .filter((token): token is string => Boolean(token && token.trim()))
  .map((token) => token.trim());
const originTrialHeader = tokens.length > 0 ? [{ key: "Origin-Trial", value: tokens.join(", ") }] : [];

/** /probe を iframe に入れてよい親のオリジン */
const probeParents = (process.env.PROBE_PARENT_ORIGINS ?? "https://agentic-commerce-lab.jp")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  transpilePackages: ["@aclab/demo-guard"],

  env: {
    /**
     * BYO キーモード。既定は off。
     * ここで値を決めておくと、公開するビルドでは `"false" === "true"` が畳まれて
     * ブラウザから Anthropic を直接呼ぶチャンクごと落ちる。
     */
    NEXT_PUBLIC_BYO_KEY_ENABLED: process.env.NEXT_PUBLIC_BYO_KEY_ENABLED ?? "false",
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // document.domain を使わない宣言。?0 だと WebMCP の API が無効になる
          { key: "Origin-Agent-Cluster", value: "?1" },
          // 同一オリジンの文書だけがツールを登録・実行できる
          { key: "Permissions-Policy", value: "tools=(self)" },
          ...originTrialHeader,
        ],
      },
      {
        // 対応判定のページだけ、記事ページからの埋め込みを許す
        source: "/probe",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${probeParents.join(" ")}` },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
