import type { Metadata } from "next";
import { SiteFooter } from "../components/site-footer.tsx";
import { SiteHeader } from "../components/site-header.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ACLAB Store(デモ)日本茶と暮らしの道具",
    template: "%s | ACLAB Store",
  },
  description:
    "エージェンティックコマースラボの検証記事で使う架空のオンラインストア。商品・レビュー・注文はすべて架空です。",
  // 架空の店舗なので検索結果には出さない
  robots: { index: false, follow: false },
};

/** チャットのドロワーは置かない。会話検索は /ask で NLWeb の応答をそのまま見せる */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
