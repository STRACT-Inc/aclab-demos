import { CATEGORY_LABELS, type Product, type Review } from "./types.ts";

/**
 * 商品ページの schema.org Product。
 * Google の Merchant listing で必須の name / image / offers(price, priceCurrency)を満たす形にする。
 * NLWeb はこの JSON をそのまま索引に入れる(trim で Brand などの型は落ちる)。
 * 画面の JSON-LD と、NLWeb に直接読ませる JSONL(server/data/products.jsonl)は同じ関数から作る。
 */

/** 架空の店のブランド名。商品にブランドの欄が無いので店名を入れる */
export const STORE_BRAND = "ACLAB Store";
export const SCHEMA_IN_STOCK = "https://schema.org/InStock";
export const SCHEMA_OUT_OF_STOCK = "https://schema.org/OutOfStock";

export interface ProductJsonLd {
  "@context": "https://schema.org";
  "@type": "Product";
  "@id": string;
  url: string;
  name: string;
  description: string;
  image: string;
  sku: string;
  category: string;
  brand: { "@type": "Brand"; name: string };
  keywords: string;
  offers: {
    "@type": "Offer";
    url: string;
    price: number;
    priceCurrency: "JPY";
    availability: typeof SCHEMA_IN_STOCK | typeof SCHEMA_OUT_OF_STOCK;
    itemCondition: "https://schema.org/NewCondition";
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
    bestRating: 5;
    worstRating: 1;
  };
  review?: ReviewJsonLd[];
}

export interface ReviewJsonLd {
  "@type": "Review";
  name: string;
  reviewBody: string;
  reviewRating: { "@type": "Rating"; ratingValue: number; bestRating: 5; worstRating: 1 };
  author: { "@type": "Person"; name: string };
}

export function productUrl(origin: string, productId: string): string {
  return `${origin}/products/${productId}`;
}

export function productImageUrl(origin: string, productId: string): string {
  return `${origin}/products/${productId}/image.svg`;
}

export function productJsonLd(product: Product, reviews: Review[], origin: string): ProductJsonLd {
  const url = productUrl(origin, product.id);
  const ld: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    url,
    name: product.name,
    description: product.summary,
    image: productImageUrl(origin, product.id),
    sku: product.id,
    category: CATEGORY_LABELS[product.category],
    brand: { "@type": "Brand", name: STORE_BRAND },
    keywords: product.tags.join(", "),
    offers: {
      "@type": "Offer",
      url,
      price: product.price_jpy,
      priceCurrency: "JPY",
      availability: product.in_stock ? SCHEMA_IN_STOCK : SCHEMA_OUT_OF_STOCK,
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (reviews.length > 0) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return ld;
}

/**
 * レビュー本文を含めた版(レビューを入れた条件を試すときだけ使う)。
 * 公開デモの JSON-LD には入れない。玉露のレビューには注入耐性の検証用の指示文が入っている。
 */
export function withReviews(ld: ProductJsonLd, reviews: Review[]): ProductJsonLd {
  return {
    ...ld,
    review: reviews.map((review) => ({
      "@type": "Review",
      name: review.title,
      reviewBody: review.body,
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
      author: { "@type": "Person", name: "購入者" },
    })),
  };
}

/** `<script type="application/ld+json">` に埋める文字列。`<` を逃がして終了タグの混入を防ぐ */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** NLWeb の db_load が読む形式の 1 行(URL、タブ、JSON) */
export function nlwebJsonlLine(ld: ProductJsonLd): string {
  return `${ld.url}\t${JSON.stringify(ld)}`;
}
