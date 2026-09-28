import { findProduct, findReviews, products } from "./data.ts";
import { err, type DomainError } from "./errors.ts";
import { CATEGORY_LABELS, type Category, type Product } from "./types.ts";

/** 検索(search_products)。1 ページ 5 件でカーソル継続 */

export const SEARCH_PAGE_SIZE = 5;
/** レビューは 1 度に 5 件まで返す */
export const REVIEW_PAGE_SIZE = 5;

export const SORTS = ["relevance", "price_asc", "price_desc", "rating_desc"] as const;
export type Sort = (typeof SORTS)[number];

export interface SearchQuery {
  query?: string;
  category?: Category;
  max_price_jpy?: number;
  sort?: Sort;
  cursor?: string;
}

export interface SearchItem {
  id: string;
  name: string;
  price_jpy: number;
  in_stock: boolean;
  category: Category;
}

export interface SearchResult {
  items: SearchItem[];
  next_cursor?: string;
  total: number;
}

const toItem = (product: Product): SearchItem => ({
  id: product.id,
  name: product.name,
  price_jpy: product.price_jpy,
  in_stock: product.in_stock,
  category: product.category,
});

function matches(product: Product, query: string): boolean {
  // タグも対象にする。「贈り物向けの日本茶」のように、商品文に無い語で探されるため
  const haystack = [
    product.name,
    product.summary,
    CATEGORY_LABELS[product.category],
    ...product.tags,
  ].join(" ");
  return query
    .split(/[\s　]+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function sortProducts(list: Product[], sort: Sort): Product[] {
  const sorted = [...list];
  switch (sort) {
    case "price_asc":
      return sorted.sort((a, b) => a.price_jpy - b.price_jpy);
    case "price_desc":
      return sorted.sort((a, b) => b.price_jpy - a.price_jpy);
    case "rating_desc":
      return sorted.sort((a, b) => b.rating - a.rating);
    default:
      // 在庫のあるものを先に、そのあとは評価順
      return sorted.sort(
        (a, b) => Number(b.in_stock) - Number(a.in_stock) || b.rating - a.rating,
      );
  }
}

/** 条件に合う商品をすべて返す。画面の一覧はこれを、ツールは searchProducts を使う */
export function filterProducts(input: SearchQuery = {}): Product[] {
  const filtered = products.filter((product) => {
    if (input.category && product.category !== input.category) return false;
    if (input.max_price_jpy !== undefined && product.price_jpy > input.max_price_jpy) return false;
    if (input.query && !matches(product, input.query)) return false;
    return true;
  });
  return sortProducts(filtered, input.sort ?? "relevance");
}

export function searchProducts(input: SearchQuery = {}): SearchResult {
  const sorted = filterProducts(input);
  const offset = Number.parseInt(input.cursor ?? "0", 10);
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const page = sorted.slice(start, start + SEARCH_PAGE_SIZE);
  const next = start + SEARCH_PAGE_SIZE;

  return {
    items: page.map(toItem),
    ...(next < sorted.length ? { next_cursor: String(next) } : {}),
    total: sorted.length,
  };
}

/** 商品 1 件の詳細(get_product) */
export function getProduct(productId: string) {
  const product = findProduct(productId);
  if (!product) {
    return err("unknown_product", `商品 ${productId} は見つかりません`, {
      hint: "search_products で商品を探してから指定してください",
    });
  }
  const reviews = findReviews(productId);
  const rated = reviews.reduce((sum, review) => sum + review.rating, 0);
  return {
    id: product.id,
    name: product.name,
    price_jpy: product.price_jpy,
    summary: product.summary,
    in_stock: product.in_stock,
    variants: product.variants,
    shipping: { days: 3, fee_jpy: 550, free_over_jpy: 5_000 },
    rating: reviews.length > 0 ? Math.round((rated / reviews.length) * 10) / 10 : product.rating,
    review_count: reviews.length,
  };
}

/** レビュー(list_reviews)。本文は 300 字で切る */
export function listReviews(productId: string, limit = REVIEW_PAGE_SIZE) {
  const product = findProduct(productId);
  if (!product) {
    return err("unknown_product", `商品 ${productId} は見つかりません`, {
      hint: "search_products で商品を探してから指定してください",
    });
  }
  const capped = Math.min(Math.max(limit, 1), REVIEW_PAGE_SIZE);
  return {
    reviews: findReviews(productId)
      .slice(0, capped)
      .map((review) => ({
        rating: review.rating,
        title: review.title,
        body: review.body.slice(0, 300),
      })),
  };
}

export type CatalogResult<T> = T | DomainError;
