import Link from "next/link";
import { ProductCard } from "../../components/product-card.tsx";
import { filterProducts, SORTS, type Sort } from "../../core/catalog.ts";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "../../core/types.ts";

const SORT_LABELS: Record<Sort, string> = {
  relevance: "おすすめ順",
  price_asc: "価格の安い順",
  price_desc: "価格の高い順",
  rating_desc: "評価の高い順",
};

/** 検索結果。トップのフォームの送信先(本物のナビゲーション) */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined;
  const rawCategory = typeof params.category === "string" ? params.category : undefined;
  const category = CATEGORIES.includes(rawCategory as Category)
    ? (rawCategory as Category)
    : undefined;
  const rawSort = typeof params.sort === "string" ? params.sort : undefined;
  const sort = SORTS.includes(rawSort as Sort) ? (rawSort as Sort) : "relevance";
  const results = filterProducts({ query, category, sort });

  const withSort = (next: Sort) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (category) search.set("category", category);
    if (next !== "relevance") search.set("sort", next);
    const qs = search.toString();
    return qs ? `/search?${qs}` : "/search";
  };

  return (
    <>
      <nav className="text-[12.5px] text-muted">
        <Link href="/" className="hover:text-accent-ink">
          ホーム
        </Link>
        <span className="mx-1.5">/</span>
        <span>{category ? CATEGORY_LABELS[category] : "検索結果"}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold">
            {query ? `「${query}」の検索結果` : category ? CATEGORY_LABELS[category] : "すべての商品"}
          </h1>
          <p className="mt-1 tnum text-[13px] text-muted">{results.length} 点</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map((option) => (
            <Link
              key={option}
              href={withSort(option)}
              className="chip"
              data-active={option === sort}
            >
              {SORT_LABELS[option]}
            </Link>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[15px] font-bold">見つかりませんでした</p>
          <p className="mt-2 text-[13.5px] text-muted">
            別の言葉で探すか、カテゴリから選んでください。
          </p>
          <Link href="/" className="btn btn-outline mt-5">
            商品一覧へ
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}
