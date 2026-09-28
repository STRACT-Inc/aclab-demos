import couponsJson from "../data/coupons.json" with { type: "json" };
import memberOrdersJson from "../data/member-orders.json" with { type: "json" };
import policiesJson from "../data/policies.json" with { type: "json" };
import productsJson from "../data/products.json" with { type: "json" };
import reviewsJson from "../data/reviews.json" with { type: "json" };
import {
  couponSchema,
  memberOrderSchema,
  policySchema,
  productSchema,
  reviewSchema,
  type Coupon,
  type MemberOrder,
  type Policy,
  type Product,
  type Review,
} from "./types.ts";
import { z } from "zod";

/**
 * 架空のカタログ。
 * 読み込み時にスキーマで検証する。データの取り違えはビルドかテストで落ちる。
 */

export const products: Product[] = z.array(productSchema).parse(productsJson);
export const reviews: Record<string, Review[]> = z
  .record(z.string(), z.array(reviewSchema))
  .parse(reviewsJson);
export const coupons: Coupon[] = z.array(couponSchema).parse(couponsJson);
export const policies: Policy[] = z.array(policySchema).parse(policiesJson);
export const memberOrders: MemberOrder[] = z.array(memberOrderSchema).parse(memberOrdersJson);

const byId = new Map(products.map((product) => [product.id, product]));

export function findProduct(productId: string): Product | undefined {
  return byId.get(productId);
}

/** 商品に紐づくレビュー。無い商品は空配列 */
export function findReviews(productId: string): Review[] {
  return reviews[productId] ?? [];
}

export function findCoupon(code: string): Coupon | undefined {
  const normalized = code.trim().toUpperCase();
  return coupons.find((coupon) => coupon.code === normalized);
}

export function findPolicy(topic: Policy["topic"]): Policy | undefined {
  return policies.find((policy) => policy.topic === topic);
}

export function findVariant(product: Product, variantId: string) {
  return product.variants.find((variant) => variant.id === variantId);
}
