import { PROBE_MESSAGE_TYPE, PROBE_PARENT_PARAM } from "@aclab/demo-contract";
import { originTrialTokens } from "../../webmcp/origin-trial.ts";

export const runtime = "nodejs";

/**
 * 対応判定のページ。
 * 記事ページが不可視の iframe で読み、document.modelContext が使えるかだけを親へ返す。
 * ツールの登録も実行もしない。判定結果はサーバへ送らない。
 *
 * Route Handler にしているのは、この 1 枚に React も CSS も要らないため。
 *
 * **Origin Trial のトークンは meta でも出す。** next.config.ts の Origin-Trial ヘッダーは
 * 同じ key が重複排除されて 1 枚(配列の最後、Edge 用)しか残らず、Chrome はこの文書を
 * トライアルの対象にしない。ルートレイアウトの meta が無いこの 1 枚だけ、本番の Chrome で
 * `document.modelContext` が生えず、記事のバッジが全員に「使えません」と出た
 * (2026-09-17、Chrome 153 stable、flag なしで確認)。meta は layout.tsx と同じ関数から出す。
 */

/** 親に送ってよいオリジン。環境変数で足す(ローカルやプレビューの確認用) */
function allowedParents(): string[] {
  return (process.env.PROBE_PARENT_ORIGINS ?? "https://agentic-commerce-lab.jp")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function GET(): Response {
  const allowed = JSON.stringify(allowedParents());
  const otMeta = originTrialTokens()
    .map((token) => `<meta http-equiv="origin-trial" content="${token}">`)
    .join("\n");
  const html = `<!doctype html>
<meta charset="utf-8">
<title>WebMCP probe</title>
${otMeta}
<script>
  (() => {
    const ALLOWED = ${allowed};
    const parentOrigin = new URLSearchParams(location.search).get(${JSON.stringify(PROBE_PARENT_PARAM)});
    if (!parentOrigin || !ALLOWED.includes(parentOrigin)) return;
    const native = "modelContext" in Document.prototype;
    const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
    parent.postMessage(
      { type: ${JSON.stringify(PROBE_MESSAGE_TYPE)}, version: 1, native, brands },
      parentOrigin,
    );
  })();
</script>
`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
