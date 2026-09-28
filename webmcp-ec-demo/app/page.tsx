import Link from "next/link";
import { ProductCard } from "../components/product-card.tsx";
import { FREE_SHIPPING_OVER_JPY, SHIPPING_FEE_JPY } from "../core/cart.ts";
import { products } from "../core/data.ts";
import { formatJpy } from "../core/format.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../core/types.ts";

/**
 * 商品一覧。検索フォームは `/search` への本物のナビゲーション。
 * WebMCP のデモでは、このフォームに toolname と toolautosubmit を足す。
 */
export default function HomePage() {
  // カテゴリごとに 1 点ずつ並べる(同じ棚ばかりが続くと店に見えない)
  const picks = CATEGORIES.map((category) =>
    products
      .filter((product) => product.category === category && product.in_stock)
      .sort((a, b) => b.rating - a.rating)
      .at(0),
  ).filter((product) => product !== undefined);

  return (
    <>
      <section className="rounded-[18px] bg-accent-soft px-6 py-10 sm:px-10 sm:py-14">
        <p className="text-[12px] font-bold tracking-[0.18em] text-accent">お茶と暮らしの道具</p>
        <h1 className="mt-3 max-w-[18em] text-[26px] font-bold leading-[1.5] sm:text-[32px]">
          日本茶と和菓子、台所と身のまわりのものを、少しずつ。
        </h1>
        <p className="mt-4 max-w-[34em] text-[14px] leading-[2.0] text-muted">
          {formatJpy(FREE_SHIPPING_OVER_JPY)} 以上のお買い上げで送料無料(通常{" "}
          {formatJpy(SHIPPING_FEE_JPY)})。2〜3 営業日で発送します。
        </p>
        <form action="/search" method="get" className="mt-6 flex max-w-[460px] gap-2">
          <label htmlFor="q" className="sr-only">
            商品を探す
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="日本茶、Tシャツ など"
            className="field rounded-full px-5"
          />
          <button type="submit" className="btn btn-primary whitespace-nowrap px-6 py-2.5">
            探す
          </button>
        </form>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[19px] font-bold">いま選ばれているもの</h2>
          <Link href="/search" className="text-[13px] text-accent-ink hover:underline">
            すべて見る
          </Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {picks.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[19px] font-bold">カテゴリから探す</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <Link
              key={category}
              href={`/search?category=${category}`}
              className="card flex items-center justify-between px-5 py-4 transition-colors hover:border-accent"
            >
              <span className="text-[14.5px] font-bold">{CATEGORY_LABELS[category]}</span>
              <span className="tnum text-[12.5px] text-muted">
                {products.filter((product) => product.category === category).length} 点
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[19px] font-bold">すべての商品</h2>
        <p className="mt-1 tnum text-[13px] text-muted">{products.length} 点</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </>
  );
}
