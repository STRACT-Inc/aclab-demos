import type { Metadata } from "next";
import { ChatMount } from "../components/chat-mount.tsx";
import { SiteFooter } from "../components/site-footer.tsx";
import { ModeBadge } from "../components/mode-badge.tsx";
import { SiteHeader } from "../components/site-header.tsx";
import { WebMcpRuntime } from "../components/webmcp-runtime.tsx";
import { originTrialTokens } from "../webmcp/origin-trial.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ACLAB Store(WebMCP 対応のデモストア)",
    template: "%s | ACLAB Store",
  },
  description:
    "エージェンティックコマースラボの検証記事で使う架空のオンラインストア。商品・レビュー・注文はすべて架空です。",
  // 架空の店舗なので検索結果には出さない
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* ヘッダーと合わせて二重に配る。Metadata API は http-equiv を出さない */}
        {originTrialTokens().map((token) => (
          <meta key={token.slice(0, 16)} httpEquiv="origin-trial" content={token} />
        ))}
      </head>
      <body className="flex min-h-dvh flex-col">
        {/* 検出とツール登録はここ 1 つ。ModeBadge や ChatMount は結果を読むだけ */}
        <WebMcpRuntime />
        <SiteHeader badge={<ModeBadge />} />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6">{children}</main>
        <SiteFooter />
        <ChatMount />
      </body>
    </html>
  );
}
