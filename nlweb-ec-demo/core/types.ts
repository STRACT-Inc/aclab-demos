import { z } from "zod";

/**
 * デモ EC のデータとドメインの型。
 * core/ は DOM を触らない。ブラウザの保存や画面の更新は app/ 側が受け持つ。
 */

export const CATEGORIES = ["tea", "wagashi", "kitchen", "apparel"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tea: "日本茶",
  wagashi: "和菓子",
  kitchen: "キッチン雑貨",
  apparel: "アパレル",
};

export const variantSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1).max(32),
    in_stock: z.boolean(),
  })
  .strict();

export const productSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1).max(60),
    category: z.enum(CATEGORIES),
    price_jpy: z.number().int().min(100).max(100_000),
    summary: z.string().min(1).max(200),
    in_stock: z.boolean(),
    rating: z.number().min(0).max(5),
    /** 検索用のタグ(贈り物・日常など)。名前と説明に出ない語で探されるため */
    tags: z.array(z.string().max(16)).max(8).default([]),
    variants: z.array(variantSchema).max(12),
  })
  .strict();

export const reviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().min(1).max(60),
    body: z.string().min(1).max(300),
  })
  .strict();

export const couponSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]+$/),
    kind: z.enum(["percent_off", "free_shipping"]),
    /** percent_off のときだけ使う */
    percent: z.number().int().min(1).max(90).optional(),
    label: z.string().max(40),
    /** 期限切れのクーポンはここに日付が入る(エラー文に出す) */
    expired_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const policySchema = z
  .object({
    topic: z.enum(["shipping", "returns", "payment"]),
    title: z.string().max(40),
    text: z.string().min(1).max(600),
  })
  .strict();

export const memberOrderSchema = z
  .object({
    order_id: z.string().min(1).max(32),
    status: z.enum(["shipped", "delivered", "canceled"]),
    placed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total_jpy: z.number().int().min(0),
    items: z.array(z.string()).min(1).max(5),
  })
  .strict();

export type Variant = z.infer<typeof variantSchema>;
export type Product = z.infer<typeof productSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Coupon = z.infer<typeof couponSchema>;
export type Policy = z.infer<typeof policySchema>;
export type PolicyTopic = Policy["topic"];
export type MemberOrder = z.infer<typeof memberOrderSchema>;

/** カートの 1 明細 */
export interface CartLine {
  line_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
}

export interface Cart {
  lines: CartLine[];
  /** 適用中のクーポンコード */
  coupon?: string;
}

/** 金額の内訳。表示にもツールの戻り値にもこの形を使う */
export interface CartTotals {
  subtotal_jpy: number;
  discount_jpy: number;
  shipping_jpy: number;
  total_jpy: number;
}

export interface Address {
  postal_code: string;
  prefecture: string;
  city: string;
  address_line: string;
  last_name: string;
  first_name: string;
  phone: string;
}

export const PAYMENT_METHODS = [
  "credit_card",
  "convenience_store",
  "cod",
  "bank_transfer",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  credit_card: "クレジットカード",
  convenience_store: "コンビニ払い",
  cod: "代引き",
  bank_transfer: "銀行振込",
};

/** 読者が確定した注文(ブラウザにだけ残る) */
export interface PlacedOrder {
  order_id: string;
  placed_at: string;
  total_jpy: number;
  status: "placed";
}

export const EMPTY_CART: Cart = { lines: [] };
