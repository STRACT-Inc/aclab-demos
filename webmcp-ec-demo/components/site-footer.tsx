import Link from "next/link";

/** フッター。架空であることを常時出す */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-[16px] font-bold">ACLAB</span>
            <span className="text-[12px] tracking-[0.24em] text-accent">STORE</span>
          </p>
          <p className="mt-3 text-[13px] leading-[1.9] text-muted">
            エージェンティックコマースの検証記事のために作った架空のストアです。
            商品・レビュー・注文はすべて架空で、実際の決済も配送もありません。
          </p>
        </div>

        <nav className="text-[13px] leading-[2.2]">
          <p className="font-bold">ご案内</p>
          <ul className="mt-1 text-muted">
            <li>
              <Link href="/data" className="hover:text-accent-ink">
                このデモが送るもの・送らないもの
              </Link>
            </li>
            <li>
              <Link href="/lab" className="hover:text-accent-ink">
                開発者向け(lab)
              </Link>
            </li>
          </ul>
        </nav>

        <nav className="text-[13px] leading-[2.2]">
          <p className="font-bold">運営</p>
          <ul className="mt-1 text-muted">
            <li>
              <a
                href="https://agentic-commerce-lab.jp"
                className="hover:text-accent-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                エージェンティックコマースラボ
              </a>
            </li>
            <li>株式会社 STRACT</li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
