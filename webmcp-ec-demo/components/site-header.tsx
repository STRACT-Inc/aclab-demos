"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { countItems } from "../core/cart.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../core/types.ts";
import { useDemoState } from "../state/use-store.ts";

/**
 * 全ページ共通のヘッダー。検索・カテゴリ・カートを上に固定する。
 * カートの数が変わった瞬間を光らせる(見せる自動化)。
 */
export function SiteHeader({ badge }: { badge?: React.ReactNode }) {
  const state = useDemoState();
  const pathname = usePathname();
  const count = countItems(state.cart);
  const previous = useRef(count);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (previous.current !== count) {
      previous.current = count;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(timer);
    }
  }, [count]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <p className="bg-ink py-1.5 text-center text-[11.5px] tracking-[0.04em] text-white">
        架空のデモストアです。実際の決済も配送もありません
      </p>

      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[18px] font-bold tracking-[0.02em]">ACLAB</span>
          <span className="text-[13px] tracking-[0.24em] text-accent">STORE</span>
        </Link>

        <form action="/search" method="get" className="ml-2 hidden flex-1 md:block">
          <label htmlFor="q-header" className="sr-only">
            商品を探す
          </label>
          <input
            id="q-header"
            name="q"
            type="search"
            defaultValue=""
            placeholder="日本茶、Tシャツ など"
            className="field rounded-full px-4"
          />
        </form>

        {badge}

        <nav className="ml-auto flex items-center gap-4 text-[13px] md:gap-5">
          <Link href="/orders" className="hidden hover:text-accent-ink sm:block">
            注文履歴
          </Link>
          <Link href="/account" className="hover:text-accent-ink">
            {state.loggedIn ? "マイページ" : "ログイン"}
          </Link>
          <Link href="/lab" className="text-muted hover:text-accent-ink">
            lab
          </Link>
          <Link
            href="/cart"
            aria-label={`カート(${count} 点)`}
            className={`btn btn-outline gap-1.5 px-4 py-2 ${flash ? "cart-flash" : ""}`}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
              <path
                d="M2 3h2.2l2.1 9.2h9l1.9-6.6H6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8.4" cy="16" r="1.3" fill="currentColor" />
              <circle cx="14.4" cy="16" r="1.3" fill="currentColor" />
            </svg>
            <span className="tnum text-[13px] font-bold">{count}</span>
          </Link>
        </nav>
      </div>

      <div className="mx-auto flex max-w-[1180px] gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
        <Link href="/" className="chip" data-active={pathname === "/"}>
          すべて
        </Link>
        {CATEGORIES.map((category) => (
          <Link key={category} href={`/search?category=${category}`} className="chip">
            {CATEGORY_LABELS[category]}
          </Link>
        ))}
      </div>
    </header>
  );
}
