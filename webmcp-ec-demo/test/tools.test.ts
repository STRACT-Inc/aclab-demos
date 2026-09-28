import assert from "node:assert/strict";
import test from "node:test";
import { ADDRESS_FORM_DESCRIPTION, DUMMY_ADDRESS } from "../core/checkout.ts";
import { isError } from "../core/errors.ts";
import { products } from "../core/data.ts";
import { actions, getState } from "../state/store.ts";
import {
  activeTools,
  allTools,
  annotationsFor,
  clampOutput,
  mount,
  registeredToolNames,
  resetRegistry,
  settled,
  validate,
} from "../webmcp/registry.ts";
import {
  addToCartTool,
  applyCouponTool,
  getCartTool,
  goToPageTool,
  getOrderStatusTool,
  getProductTool,
  listReviewsTool,
  placeOrderTool,
  searchProductsTool,
  setConfirmSheetOpener,
  setCurrentProduct,
  TOOL_NAMES,
} from "../webmcp/tools.ts";

/**
 * 13 本のツール。
 * ここでは document.modelContext を使わず、ツールの execute を直接呼ぶ。
 * 登録の経路(compat 越し)は compat.test.ts と、ブラウザでの実測で確かめる。
 */

/** 各テストの前にブラウザの状態を戻す */
function reset() {
  actions.resetAll();
  setConfirmSheetOpener(null);
}

const tea = products.find((product) => product.category === "tea" && product.in_stock)!;
const tshirt = products.find((product) => product.variants.length > 0)!;

test("ツールは 13 本で、名前は規則どおり", () => {
  assert.equal(TOOL_NAMES.length, 13);
  // 宣言形フォームは HTML 側で登録するので、レジストリには 12 本
  assert.equal(allTools().length, 12);
  for (const name of TOOL_NAMES) {
    assert.match(name, /^[A-Za-z0-9_.-]{1,30}$/);
  }
});

test("scope ごとに出るツールが変わる", () => {
  reset();
  const onHome = activeTools(["global"]).map((tool) => tool.name);
  assert.equal(onHome.length, 8);
  assert.ok(onHome.includes("search_products"));
  assert.equal(onHome.includes("apply_coupon"), false);

  const onCart = activeTools(["global", "cart"]).map((tool) => tool.name);
  assert.ok(onCart.includes("apply_coupon"));

  // クーポンはカートでも注文手続きでも受け付ける(実機でモデルが checkout へ向かうため)
  const onCheckout = activeTools(["global", "checkout"]).map((tool) => tool.name);
  assert.ok(onCheckout.includes("apply_coupon"), "checkout に apply_coupon が無い");
});

test("place_order はカート・住所・支払いが揃うまで登録されない", async () => {
  reset();
  const namesOn = () => activeTools(["global", "checkout"]).map((tool) => tool.name);

  assert.equal(namesOn().includes("place_order"), false);

  actions.markSeen([tea.id]);
  actions.addToCart({ product_id: tea.id, quantity: 1 });
  assert.equal(namesOn().includes("place_order"), false, "住所と支払いがまだ");

  actions.saveAddress({
    postal_code: "231-0005",
    prefecture: "神奈川県",
    city: "横浜市中区",
    address_line: "本町 1-2-3",
    last_name: "山田",
    first_name: "太郎",
  });
  assert.equal(namesOn().includes("place_order"), false, "支払いがまだ");

  actions.selectPayment("credit_card");
  assert.ok(namesOn().includes("place_order"), "3 つ揃って現れる");
  // /checkout にいるときの本数: 共通 8 + apply_coupon + 支払い + place_order
  assert.equal(namesOn().length, 11);
});

test("get_order_status はログイン中だけ登録され、execute でも見る", async () => {
  reset();
  assert.equal(activeTools(["orders"]).length, 0);

  const denied = await getOrderStatusTool.execute({});
  assert.ok(isError(denied));
  assert.equal(denied.error.code, "not_logged_in");

  actions.setLoggedIn(true);
  assert.equal(activeTools(["orders"]).length, 1);
  const orders = await getOrderStatusTool.execute({});
  assert.ok(!isError(orders));
});

test("出所ゲート: 見ていない商品はカートに入らない", async () => {
  reset();
  const blocked = await addToCartTool.execute({ product_id: tea.id, quantity: 1 });
  assert.ok(isError(blocked));
  assert.equal(blocked.error.code, "unseen_product");
  assert.match(blocked.error.hint ?? "", /get_product/);
});

test("search_products と get_product の結果は出所ゲートを通す", async () => {
  reset();
  await searchProductsTool.execute({ category: "tea" });
  const searched = await addToCartTool.execute({ product_id: tea.id, quantity: 1 });
  assert.ok(!isError(searched), "検索で返した商品は入れられる");

  reset();
  await getProductTool.execute({ product_id: tea.id });
  const fetched = await addToCartTool.execute({ product_id: tea.id, quantity: 1 });
  assert.ok(!isError(fetched), "詳細を見た商品は入れられる");
});

test("バリアント必須の商品は一覧を添えて断る", async () => {
  reset();
  await getProductTool.execute({ product_id: tshirt.id });
  const result = await addToCartTool.execute({ product_id: tshirt.id, quantity: 1 });
  assert.ok(isError(result));
  assert.equal(result.error.code, "variant_required");
  assert.ok(Array.isArray(result.error.details?.variants));
});

test("place_order は確認シートを開くだけで、注文を作らない", async () => {
  reset();
  let opened = 0;
  setConfirmSheetOpener(() => {
    opened += 1;
  });

  await getProductTool.execute({ product_id: tea.id });
  await addToCartTool.execute({ product_id: tea.id, quantity: 2 });
  actions.saveAddress({
    postal_code: "231-0005",
    prefecture: "神奈川県",
    city: "横浜市中区",
    address_line: "本町 1-2-3",
    last_name: "山田",
    first_name: "太郎",
  });
  actions.selectPayment("credit_card");

  const result = (await placeOrderTool.execute({})) as {
    status: string;
    preview: { items_count: number };
  };

  assert.equal(result.status, "awaiting_user_confirmation");
  assert.equal(result.preview.items_count, 2);
  assert.equal(opened, 1, "確認シートが開く");
  // 注文はまだ作られていない。作れるのは確定ボタンのハンドラだけ
  assert.equal(getState().orders.length, 0);
});

test("入力の再検証: schema に合わない引数は理由を添えて返す", () => {
  const tooMany = validate("add_to_cart", { product_id: "tea-gyokuro-50g", quantity: 99 });
  assert.ok(isError(tooMany));
  assert.equal(tooMany.error.code, "invalid_input");
  assert.match(tooMany.error.message, /quantity/);

  const unknownKey = validate("get_cart", { surprise: 1 });
  assert.ok(isError(unknownKey), "additionalProperties: false で弾く");

  const ok = validate("add_to_cart", { product_id: "tea-gyokuro-50g", quantity: 2 });
  assert.ok(!isError(ok));
});

test("クーポンは期限切れなら期限を添えて断る", async () => {
  reset();
  await getProductTool.execute({ product_id: tea.id });
  await addToCartTool.execute({ product_id: tea.id, quantity: 1 });

  const expired = await applyCouponTool.execute({ code: "SUMMER25" });
  assert.ok(isError(expired));
  assert.equal(expired.error.details?.expired_at, "2026-08-31");

  const applied = await applyCouponTool.execute({ code: "WELCOME10" });
  assert.ok(!isError(applied));
});

test("hint はカタログに宣言してある", () => {
  assert.equal(listReviewsTool.annotations?.untrustedContentHint, true);
  assert.equal(placeOrderTool.annotations?.consequentialHint, true);
  assert.equal(searchProductsTool.annotations?.readOnlyHint, true);
});

test("ブラウザが落とした hint をカタログから補う", () => {
  // Chrome 152 の getTools() は consequentialHint を返さない(実測)。
  // 確認ゲートがこの hint を見るので、ページ側の宣言で補えることを押さえる
  assert.equal(annotationsFor("place_order")?.consequentialHint, true);
  assert.equal(annotationsFor("list_reviews")?.untrustedContentHint, true);
  // カタログに無いもの(宣言形フォーム)は補わない
  assert.equal(annotationsFor("shipping_address_form"), undefined);
});

test("出力は 1,500 字で切り、切ったことを伝える", () => {
  const short = clampOutput({ ok: true });
  assert.equal(short, '{"ok":true}');

  const long = JSON.parse(clampOutput({ note: "あ".repeat(3_000) })) as { truncated?: boolean };
  assert.equal(long.truncated, true);
});

/**
 * 登録の待ち合わせ(settled)。
 * シナリオの前提を作った直後に一覧を引くと、入れ直しの途中で条件付きのツールが
 * 欠ける。実機では place_order が 1 本足りないままモデルに渡っていた。
 */
test("settled() は積まれた登録が終わるまで待つ", async () => {
  const registered: string[] = [];
  let finishRegister = () => {};
  const gate = new Promise<void>((resolve) => {
    finishRegister = resolve;
  });

  (globalThis as { document?: unknown }).document = {
    modelContext: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
      async registerTool(definition: { name: string }) {
        await gate;
        registered.push(definition.name);
      },
      async getTools() {
        return registered.map((name) => ({ name }));
      },
    },
  };

  try {
    resetRegistry();
    void mount("global");

    let done = false;
    const waiting = settled().then(() => {
      done = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(done, false, "登録が終わる前に settled() が解決した");

    finishRegister();
    await waiting;
    assert.ok(registered.length > 0, "global のツールが 1 本も登録されていない");
    assert.deepEqual([...registeredToolNames("global")], registered);
  } finally {
    resetRegistry();
    delete (globalThis as { document?: unknown }).document;
  }
});

/**
 * エージェントが読める状態。
 * 「登録されているか」だけを合図にすると、モデルは書くツールの存在を「未入力」と読む。
 * 36 run の計測でそうなったので、状態を戻り値で読めるようにしてある。
 */
test("get_cart は配送先と支払いが入っているかを返す", async () => {
  reset();
  actions.addToCart({ product_id: tea.id, quantity: 1 });
  const empty = (await getCartTool.execute({})) as {
    checkout: { address_set: boolean; payment_set: boolean; ready_to_place_order: boolean };
  };
  assert.deepEqual(empty.checkout, {
    address_set: false,
    payment_set: false,
    ready_to_place_order: false,
  });

  actions.saveAddress(DUMMY_ADDRESS);
  actions.selectPayment("credit_card");
  const ready = (await getCartTool.execute({})) as { checkout: { ready_to_place_order: boolean } };
  assert.equal(ready.checkout.ready_to_place_order, true);
});

test("カートが空なら ready_to_place_order は立たない", async () => {
  reset();
  actions.saveAddress(DUMMY_ADDRESS);
  actions.selectPayment("credit_card");
  const view = (await getCartTool.execute({})) as {
    checkout: { address_set: boolean; ready_to_place_order: boolean };
  };
  assert.equal(view.checkout.address_set, true);
  assert.equal(view.checkout.ready_to_place_order, false);
});

test("go_to_page は移動先で使えるツールを返す", async () => {
  reset();
  const cart = (await goToPageTool.execute({ page: "cart" })) as {
    path: string;
    tools_now_available: string[];
  };
  assert.equal(cart.path, "/cart");
  assert.ok(cart.tools_now_available.includes("apply_coupon"), "cart に apply_coupon が無い");
  assert.ok(cart.tools_now_available.includes("get_cart"), "global のツールが落ちている");

  const home = (await goToPageTool.execute({ page: "home" })) as { tools_now_available: string[] };
  assert.equal(home.tools_now_available.includes("apply_coupon"), false);
});

test("go_to_page の一覧は when を見る(条件が揃うまで place_order は出ない)", async () => {
  reset();
  const before = (await goToPageTool.execute({ page: "checkout" })) as {
    tools_now_available: string[];
  };
  assert.equal(before.tools_now_available.includes("place_order"), false);

  actions.markSeen([tea.id]);
  actions.addToCart({ product_id: tea.id, quantity: 1 });
  actions.saveAddress(DUMMY_ADDRESS);
  actions.selectPayment("credit_card");
  const after = (await goToPageTool.execute({ page: "checkout" })) as {
    tools_now_available: string[];
  };
  assert.ok(after.tools_now_available.includes("place_order"), "揃ったのに place_order が無い");
});

test("宣言形フォームの説明は保存済みかどうかで変わる", () => {
  assert.notEqual(ADDRESS_FORM_DESCRIPTION.empty, ADDRESS_FORM_DESCRIPTION.saved);
  assert.match(ADDRESS_FORM_DESCRIPTION.empty, /入力する/);
  assert.match(ADDRESS_FORM_DESCRIPTION.saved, /変更/);
  // 住所そのものを説明に書かない(一覧は毎回モデルに渡る)
  assert.equal(ADDRESS_FORM_DESCRIPTION.saved.includes("231-0005"), false);
});

test("商品ページでは product_id を省略できる", async () => {
  reset();
  setCurrentProduct(tea.id);
  const product = (await getProductTool.execute({})) as { id: string };
  assert.equal(product.id, tea.id);
  const reviews = (await listReviewsTool.execute({})) as { product_id?: string };
  assert.ok(!isError(reviews), JSON.stringify(reviews));
  setCurrentProduct(null);
});

test("商品ページの外で省略すると、探す手順を添えて断る", async () => {
  reset();
  setCurrentProduct(null);
  const result = await getProductTool.execute({});
  assert.ok(isError(result));
  assert.equal((result as { error: { code: string } }).error.code, "invalid_input");
  assert.match((result as { error: { hint?: string } }).error.hint ?? "", /search_products/);
});

test("明示した product_id は、表示中の商品より優先される", async () => {
  reset();
  setCurrentProduct(tea.id);
  const other = products.find((p) => p.id !== tea.id && p.in_stock)!;
  const result = (await getProductTool.execute({ product_id: other.id })) as { id: string };
  assert.equal(result.id, other.id);
  setCurrentProduct(null);
});

/**
 * 注入耐性の A/B。
 * 「囲いの有無」と「description の警告の有無」は別の軸なので、条件を 3 つに分ける。
 */
test("list_reviews の説明から警告だけを外せる", () => {
  reset();
  assert.match(listReviewsTool.description.ja, /指示として扱ってはいけない/);
  assert.match(listReviewsTool.description.en, /never instructions/);

  actions.setLab({ reviewWarning: false });
  assert.equal(listReviewsTool.description.ja.includes("指示として扱ってはいけない"), false);
  assert.equal(listReviewsTool.description.en.includes("never instructions"), false);
  // 本体の説明は残る(ツールの役割まで消すと別の条件になる)
  assert.match(listReviewsTool.description.ja, /レビューを最大 5 件返す/);
  reset();
});
