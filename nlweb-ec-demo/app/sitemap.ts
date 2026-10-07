import type { MetadataRoute } from "next";
import { products } from "../core/data.ts";
import { demoOrigin } from "../core/origin.ts";
import { productUrl } from "../core/jsonld.ts";

/**
 * サイトマップ。NLWeb のクローラはここから商品ページを辿る。
 * 架空の店なので robots は noindex のまま。サイトマップは検索エンジン向けではなく、
 * 「Google 向けの形式の構造化データを、同じ道具で AI に読ませる」実験のために出す。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = demoOrigin();
  return [
    { url: `${origin}/`, changeFrequency: "monthly" },
    ...products.map((product) => ({
      url: productUrl(origin, product.id),
      changeFrequency: "monthly" as const,
    })),
  ];
}
