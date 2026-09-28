import assert from "node:assert/strict";
import test from "node:test";
import { isAddressValid } from "../core/checkout.ts";
import { isError } from "../core/errors.ts";
import { findProduct } from "../core/data.ts";
import {
  parseScenarioLink,
  scenarioHref,
  SCENARIOS,
  SCENARIO_IDS,
  findScenario,
} from "../scenarios.ts";
import { actions, getState, storageSnapshot } from "../state/store.ts";
import { DECLARATIVE_TOOL_NAME, TOOL_NAMES } from "../webmcp/tools.ts";

/**
 * シナリオ定義。
 * 前提が作れないシナリオは、実機で気づく前にここで落とす。
 */

const KNOWN_TOOLS = new Set<string>([...TOOL_NAMES, DECLARATIVE_TOOL_NAME]);

test("記事の検証シナリオ 7 本が並んでいる", () => {
  assert.deepEqual(SCENARIO_IDS, [
    "gift-tea",
    "tshirt-coupon",
    "address",
    "reviews",
    "place-order",
    "policy",
    "order-status",
  ]);
});

test("expected_tools はカタログにある名前だけ", () => {
  for (const scenario of SCENARIOS) {
    for (const name of scenario.expected_tools) {
      assert.ok(KNOWN_TOOLS.has(name), `${scenario.id}: 知らないツール ${name}`);
    }
  }
});

test("商品ページを前提にするシナリオは実在の商品を指す", () => {
  for (const scenario of SCENARIOS) {
    const match = /^\/products\/(.+)$/.exec(scenario.path);
    if (!match) continue;
    assert.ok(findProduct(match[1]), `${scenario.id}: 商品 ${match[1]} が無い`);
  }
});

test("どのシナリオの前提もそのまま作れる", () => {
  for (const scenario of SCENARIOS) {
    actions.resetAll();
    const result = actions.applyScenarioSetup(scenario.setup);
    assert.ok(!isError(result), `${scenario.id}: ${JSON.stringify(result)}`);
    const state = getState();
    assert.equal(state.cart.lines.length, scenario.setup.cart.length);
    assert.equal(state.loggedIn, scenario.setup.logged_in);
    assert.equal(state.payment, scenario.setup.payment);
    assert.deepEqual(state.orders, []);
  }
  actions.resetAll();
});

test("前提で入れた商品は出所ゲートを通っている", () => {
  actions.resetAll();
  const scenario = findScenario("place-order")!;
  actions.applyScenarioSetup(scenario.setup);
  for (const line of scenario.setup.cart) {
    assert.ok(actions.hasSeen(line.product_id), `${line.product_id} が seen に無い`);
  }
  actions.resetAll();
});

test("place-order は住所と支払いが揃った状態から始まる", () => {
  actions.resetAll();
  actions.applyScenarioSetup(findScenario("place-order")!.setup);
  const state = getState();
  assert.ok(isAddressValid(state.address));
  assert.equal(state.payment, "credit_card");
  assert.ok(state.cart.lines.length >= 2);
  actions.resetAll();
});

test("address は住所が空のまま始まる", () => {
  actions.resetAll();
  actions.applyScenarioSetup(findScenario("address")!.setup);
  assert.equal(getState().address, null);
  actions.resetAll();
});

test("deep link を読む", () => {
  const link = parseScenarioLink("?scenario=gift-tea&open=chat&from=article");
  assert.equal(link?.scenario.id, "gift-tea");
  assert.equal(link?.openChat, true);
  assert.equal(link?.fromArticle, true);
});

test("open と from が無ければ自動で送らない", () => {
  const link = parseScenarioLink("?scenario=policy");
  assert.equal(link?.scenario.id, "policy");
  assert.equal(link?.openChat, false);
  assert.equal(link?.fromArticle, false);
});

test("知らないシナリオ ID は無視する", () => {
  assert.equal(parseScenarioLink("?scenario=unknown&open=chat"), null);
  assert.equal(parseScenarioLink(""), null);
});

test("組み立てた deep link は同じシナリオに戻る", () => {
  for (const scenario of SCENARIOS) {
    const href = scenarioHref(scenario, "article");
    const [path, search] = href.split("?");
    assert.equal(path, scenario.path);
    const link = parseScenarioLink(`?${search}`);
    assert.equal(link?.scenario.id, scenario.id);
    assert.equal(link?.openChat, true);
    assert.equal(link?.fromArticle, true);
  }
});

test("前提の状態は、そのままブラウザの保存に流し込める形で出せる", () => {
  actions.resetAll();
  actions.applyScenarioSetup(findScenario("place-order")!.setup);
  const snapshot = storageSnapshot();
  assert.deepEqual(
    (snapshot.local["aclab.cart.v1"] as { lines: unknown[] }).lines.length,
    2,
  );
  assert.equal((snapshot.local["aclab.session.v1"] as { logged_in: boolean }).logged_in, false);
  const checkout = snapshot.session["aclab.checkout.v1"] as { payment: string | null };
  assert.equal(checkout.payment, "credit_card");
  // 画面の保存と同じ鍵を使う(ずれるとハーネスの前提だけ効かなくなる)
  assert.deepEqual(Object.keys(snapshot.local).sort(), [
    "aclab.cart.v1",
    "aclab.lab.v1",
    "aclab.orders.v1",
    "aclab.session.v1",
  ]);
  actions.resetAll();
});
