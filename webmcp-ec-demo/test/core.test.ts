import assert from "node:assert/strict";
import test from "node:test";
import { filterProducts, listReviews, searchProducts, SEARCH_PAGE_SIZE } from "../core/catalog.ts";
import {
  addToCart,
  applyCoupon,
  cartView,
  FREE_SHIPPING_OVER_JPY,
  MAX_QUANTITY_PER_LINE,
  setCartQuantity,
  SHIPPING_FEE_JPY,
  totals,
} from "../core/cart.ts";
import { createOrder, normalizeAddress, previewOrder } from "../core/checkout.ts";
import { products } from "../core/data.ts";
import { isError } from "../core/errors.ts";
import { getPolicy } from "../core/policy.ts";
import { EMPTY_CART, type Cart } from "../core/types.ts";

/** データは読み込み時にスキーマで検証される(core/data.ts)。ここでは数と形を押さえる */
test("カタログは 24 点で、カテゴリごとに 6 点ずつある", () => {
  assert.equal(products.length, 24);
  for (const category of ["tea", "wagashi", "kitchen", "apparel"]) {
    assert.equal(products.filter((product) => product.category === category).length, 6);
  }
  assert.ok(products.some((product) => product.id === "tea-gyokuro-50g"));
});

test("検索は 5 件ずつ返し、続きがあればカーソルを付ける", () => {
  const first = searchProducts({});
  assert.equal(first.items.length, SEARCH_PAGE_SIZE);
  assert.equal(first.total, 24);
  assert.equal(first.next_cursor, "5");

  const second = searchProducts({ cursor: first.next_cursor });
  assert.notEqual(second.items[0]?.id, first.items[0]?.id);
});

test("カテゴリと上限価格で絞れる", () => {
  const tea = filterProducts({ category: "tea", max_price_jpy: 3_000 });
  assert.ok(tea.length >= 3);
  assert.ok(tea.every((product) => product.category === "tea" && product.price_jpy <= 3_000));
});

test("同じ商品を追加すると 1 明細にまとまり、上限を超えたら断る", () => {
  const tea = products.find((product) => product.category === "tea" && product.in_stock)!;
  const once = addToCart(EMPTY_CART, { product_id: tea.id, quantity: 2 });
  assert.ok(!isError(once));
  const twice = addToCart(once as Cart, { product_id: tea.id, quantity: 3 });
  assert.ok(!isError(twice));
  assert.equal((twice as Cart).lines.length, 1);
  assert.equal((twice as Cart).lines[0]?.quantity, 5);

  const over = addToCart(twice as Cart, {
    product_id: tea.id,
    quantity: MAX_QUANTITY_PER_LINE,
  });
  assert.ok(isError(over));
  assert.equal(over.error.code, "quantity_limit");
});

test("バリアントのある商品はバリアント無しで追加できない", () => {
  const tshirt = products.find((product) => product.variants.length > 0)!;
  const result = addToCart(EMPTY_CART, { product_id: tshirt.id, quantity: 1 });
  assert.ok(isError(result));
  assert.equal(result.error.code, "variant_required");
  assert.ok(Array.isArray(result.error.details?.variants));
});

test("在庫切れの商品は追加できない", () => {
  const soldOut = products.find((product) => !product.in_stock);
  assert.ok(soldOut, "在庫切れの商品がデータにある");
  const result = addToCart(EMPTY_CART, { product_id: soldOut!.id, quantity: 1 });
  assert.ok(isError(result));
  assert.equal(result.error.code, "out_of_stock");
});

test("数量 0 で明細を消し、最後の 1 行を消すとクーポンも外れる", () => {
  const tea = products.find((product) => product.category === "tea" && product.in_stock)!;
  const cart = addToCart(EMPTY_CART, { product_id: tea.id, quantity: 1 }) as Cart;
  const withCoupon = applyCoupon(cart, "WELCOME10") as Cart;
  assert.equal(withCoupon.coupon, "WELCOME10");

  const emptied = setCartQuantity(withCoupon, {
    line_id: withCoupon.lines[0]!.line_id,
    quantity: 0,
  }) as Cart;
  assert.equal(emptied.lines.length, 0);
  assert.equal(emptied.coupon, undefined);
});

test("送料は 5,000 円以上で無料になり、SHIP0 でも無料になる", () => {
  const cheap = products
    .filter((product) => product.in_stock && product.variants.length === 0)
    .sort((a, b) => a.price_jpy - b.price_jpy)[0]!;
  const cart = addToCart(EMPTY_CART, { product_id: cheap.id, quantity: 1 }) as Cart;
  assert.equal(totals(cart).shipping_jpy, SHIPPING_FEE_JPY);

  const withFreeShipping = applyCoupon(cart, "SHIP0") as Cart;
  assert.equal(totals(withFreeShipping).shipping_jpy, 0);

  const many = addToCart(cart, {
    product_id: cheap.id,
    quantity: Math.ceil(FREE_SHIPPING_OVER_JPY / cheap.price_jpy),
  });
  if (!isError(many)) {
    const view = cartView(many);
    if (view.subtotal_jpy >= FREE_SHIPPING_OVER_JPY) assert.equal(view.shipping_jpy, 0);
  }
});

test("期限切れのクーポンは期限を添えて断る", () => {
  const tea = products.find((product) => product.in_stock && product.variants.length === 0)!;
  const cart = addToCart(EMPTY_CART, { product_id: tea.id, quantity: 1 }) as Cart;
  const result = applyCoupon(cart, "SUMMER25");
  assert.ok(isError(result));
  assert.equal(result.error.code, "invalid_coupon");
  assert.equal(result.error.details?.expired_at, "2026-08-31");
});

test("空のカートにはクーポンを当てられない", () => {
  const result = applyCoupon(EMPTY_CART, "WELCOME10");
  assert.ok(isError(result));
  assert.equal(result.error.code, "cart_empty");
});

test("住所は全角でも受け取り、郵便番号と電話を直す", () => {
  const address = normalizeAddress({
    postal_code: "２３１ー０００５",
    prefecture: "神奈川県",
    city: "横浜市中区",
    address_line: "本町 1-2-3",
    last_name: "山田",
    first_name: "太郎",
    phone: "090-0000-0000",
  });

  assert.ok(!isError(address));
  assert.equal(address.postal_code, "231-0005");
  assert.equal(address.phone, "09000000000");
});

test("郵便番号は全角でもダッシュ違いでも受け取る", () => {
  // フォームの pattern もこの範囲に合わせる。半角だけにすると、全角で入れた利用者も
  // エージェントもブラウザの検証で止まり、この正規化まで届かない
  for (const postal of ["２３１ー０００５", "231-0005", "2310005", "２３１−０００５"]) {
    const result = normalizeAddress({
      postal_code: postal,
      prefecture: "神奈川県",
      city: "横浜市中区",
      address_line: "本町 1-2-3",
      last_name: "山田",
      first_name: "太郎",
    });
    assert.ok(!isError(result), `${postal} を受け取れる`);
    assert.equal(result.postal_code, "231-0005");
  }
});

test("足りない項目は名前を添えて返す", () => {
  const result = normalizeAddress({ postal_code: "231-0005", prefecture: "神奈川県" });
  assert.ok(isError(result));
  assert.equal(result.error.code, "address_invalid");
  assert.deepEqual(result.error.details?.invalid_fields, [
    "city",
    "address_line",
    "last_name",
    "first_name",
  ]);
});

test("空のカートでは注文を作れない", () => {
  const result = createOrder(EMPTY_CART);
  assert.ok(isError(result));
  assert.equal(result.error.code, "cart_empty");
});

test("確認シートに出す内容は点数と合計だけ", () => {
  const tea = products.find((product) => product.in_stock && product.variants.length === 0)!;
  const cart = addToCart(EMPTY_CART, { product_id: tea.id, quantity: 2 }) as Cart;
  assert.deepEqual(previewOrder(cart), {
    items_count: 2,
    total_jpy: totals(cart).total_jpy,
  });
});

test("規約には返品 14 日と 5,000 円以上の送料無料が書いてある", () => {
  const returns = getPolicy("returns");
  assert.ok(!isError(returns));
  assert.ok(returns.text.includes("14 日"));

  const shipping = getPolicy("shipping");
  assert.ok(!isError(shipping));
  assert.ok(shipping.text.includes("5,000 円"));

  const unknown = getPolicy("nope");
  assert.ok(isError(unknown));
});

test("レビューは 5 件までで、本文は 300 字を超えない", () => {
  const target = products.find((product) => (listReviews(product.id) as { reviews: unknown[] }).reviews.length > 0)!;
  const result = listReviews(target.id, 99);
  assert.ok(!isError(result));
  assert.ok(result.reviews.length <= 5);
  assert.ok(result.reviews.every((review) => review.body.length <= 300));
});
