import { findCoupon, findProduct, findVariant } from "./data.ts";
import { err, type DomainError } from "./errors.ts";
import type { Cart, CartLine, CartTotals } from "./types.ts";

/** カート(コードで守るルールをここに置く。WebMCP もフォームも同じ関数を通す) */

export const MAX_QUANTITY_PER_LINE = 10;
export const MAX_LINES = 8;
export const SHIPPING_FEE_JPY = 550;
export const FREE_SHIPPING_OVER_JPY = 5_000;

/** 明細の ID は商品とバリアントから決める。同じ組み合わせは 1 行にまとまる */
export const lineId = (productId: string, variantId?: string): string =>
  variantId ? `${productId}__${variantId}` : productId;

export interface AddToCartInput {
  product_id: string;
  variant_id?: string;
  quantity: number;
}

export function addToCart(cart: Cart, input: AddToCartInput): Cart | DomainError {
  const product = findProduct(input.product_id);
  if (!product) {
    return err("unknown_product", `商品 ${input.product_id} は見つかりません`, {
      hint: "search_products で商品を探してから指定してください",
    });
  }
  if (!product.in_stock) {
    return err("out_of_stock", `${product.name} は在庫切れです`, {
      hint: "search_products で似た商品を探して提案してください",
    });
  }
  if (product.variants.length > 0 && !input.variant_id) {
    return err("variant_required", `${product.name} はサイズや色の指定が要ります`, {
      hint: "variant_id を指定してください",
      details: { variants: product.variants },
    });
  }
  if (input.variant_id) {
    const variant = findVariant(product, input.variant_id);
    if (!variant) {
      return err("variant_required", `${input.variant_id} は選べません`, {
        hint: "利用できるバリアントから選んでください",
        details: { variants: product.variants },
      });
    }
    if (!variant.in_stock) {
      return err("out_of_stock", `${product.name}(${variant.label})は在庫切れです`, {
        hint: "別のサイズや色を提案してください",
        details: { variants: product.variants },
      });
    }
  }

  const id = lineId(input.product_id, input.variant_id);
  const existing = cart.lines.find((line) => line.line_id === id);
  const quantity = (existing?.quantity ?? 0) + input.quantity;

  if (quantity > MAX_QUANTITY_PER_LINE) {
    return err("quantity_limit", `1 つの商品は ${MAX_QUANTITY_PER_LINE} 個までです`, {
      hint: "数量を減らしてください",
      details: { max_quantity: MAX_QUANTITY_PER_LINE, current: existing?.quantity ?? 0 },
    });
  }
  if (!existing && cart.lines.length >= MAX_LINES) {
    return err("cart_full", `カートに入れられるのは ${MAX_LINES} 種類までです`, {
      hint: "先に set_cart_quantity で不要な明細を減らしてください",
      details: { max_lines: MAX_LINES },
    });
  }

  const line: CartLine = {
    line_id: id,
    product_id: input.product_id,
    ...(input.variant_id ? { variant_id: input.variant_id } : {}),
    quantity,
  };
  return {
    ...cart,
    lines: existing
      ? cart.lines.map((current) => (current.line_id === id ? line : current))
      : [...cart.lines, line],
  };
}

export function setCartQuantity(
  cart: Cart,
  input: { line_id: string; quantity: number },
): Cart | DomainError {
  const existing = cart.lines.find((line) => line.line_id === input.line_id);
  if (!existing) {
    return err("line_not_found", `明細 ${input.line_id} はカートにありません`, {
      hint: "get_cart で line_id を確認してください",
    });
  }
  if (input.quantity > MAX_QUANTITY_PER_LINE) {
    return err("quantity_limit", `1 つの商品は ${MAX_QUANTITY_PER_LINE} 個までです`, {
      hint: "数量を減らしてください",
      details: { max_quantity: MAX_QUANTITY_PER_LINE },
    });
  }
  if (input.quantity <= 0) {
    const lines = cart.lines.filter((line) => line.line_id !== input.line_id);
    return { ...cart, lines, ...(lines.length === 0 ? { coupon: undefined } : {}) };
  }
  return {
    ...cart,
    lines: cart.lines.map((line) =>
      line.line_id === input.line_id ? { ...line, quantity: input.quantity } : line,
    ),
  };
}

export function applyCoupon(cart: Cart, code: string): Cart | DomainError {
  if (cart.lines.length === 0) {
    return err("cart_empty", "カートが空です", { hint: "先に商品を追加してください" });
  }
  const coupon = findCoupon(code);
  if (!coupon) {
    return err("invalid_coupon", `クーポン ${code} は使えません`, {
      hint: "コードを確認してください",
    });
  }
  if (coupon.expired_at) {
    return err("invalid_coupon", `クーポン ${coupon.code} は期限切れです`, {
      hint: "別のコードを確認してください",
      details: { expired_at: coupon.expired_at },
    });
  }
  return { ...cart, coupon: coupon.code };
}

export function countItems(cart: Cart): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function totals(cart: Cart): CartTotals {
  const subtotal = cart.lines.reduce((sum, line) => {
    const product = findProduct(line.product_id);
    return sum + (product ? product.price_jpy * line.quantity : 0);
  }, 0);

  const coupon = cart.coupon ? findCoupon(cart.coupon) : undefined;
  const usable = coupon && !coupon.expired_at ? coupon : undefined;
  const discount =
    usable?.kind === "percent_off" && usable.percent
      ? Math.floor((subtotal * usable.percent) / 100)
      : 0;

  const payable = subtotal - discount;
  const freeShipping = usable?.kind === "free_shipping" || payable >= FREE_SHIPPING_OVER_JPY;
  const shipping = cart.lines.length === 0 || freeShipping ? 0 : SHIPPING_FEE_JPY;

  return {
    subtotal_jpy: subtotal,
    discount_jpy: discount,
    shipping_jpy: shipping,
    total_jpy: payable + shipping,
  };
}

/** 画面とツールが共有するカートの表示形(get_cart) */
export function cartView(cart: Cart) {
  return {
    lines: cart.lines.map((line) => {
      const product = findProduct(line.product_id);
      const variant =
        product && line.variant_id ? findVariant(product, line.variant_id) : undefined;
      return {
        line_id: line.line_id,
        product_id: line.product_id,
        name: product?.name ?? line.product_id,
        variant_label: variant?.label,
        quantity: line.quantity,
        price_jpy: product?.price_jpy ?? 0,
      };
    }),
    ...totals(cart),
    ...(cart.coupon ? { coupon: cart.coupon } : {}),
  };
}
