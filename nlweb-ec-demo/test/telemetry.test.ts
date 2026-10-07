import assert from "node:assert/strict";
import test from "node:test";
import { createTelemetry, shouldSend } from "../state/telemetry.ts";

/**
 * 公開時の受け入れ条件:
 * 統計が無効、または同意が無いあいだはブラウザから何も送らない。
 */

const browser = { brand: "chrome", major: 153, mobile: false };

function telemetry(enabled: boolean, consent: boolean) {
  const sent: string[] = [];
  const api = createTelemetry({
    enabled,
    telemetryId: "abcdefghijklmnopqrstu",
    fromArticle: true,
    browser,
    consent: () => consent,
    send: (_url, body) => sent.push(body),
    now: () => new Date("2026-09-20T13:24:00Z"),
  });
  return { api, sent };
}

test("統計が無効なら、同意があっても送らない", () => {
  const { api, sent } = telemetry(false, true);
  api.markChatOpened();
  api.markTurn("done", 2, 1_200);

  assert.equal(api.flush(), false);
  assert.equal(sent.length, 0);
});

test("統計が有効でも、同意が無ければ送らない", () => {
  const { api, sent } = telemetry(true, false);
  api.markChatOpened();

  assert.equal(api.flush(), false);
  assert.equal(sent.length, 0);
});

test("有効かつ同意があるときだけ、要約を 1 件送る", () => {
  const { api, sent } = telemetry(true, true);
  api.markChatOpened();
  api.markTurn("limit", 6, 3_000);
  api.markTool("search_products", { ok: true });
  api.markTool("add_to_cart", { error: "unseen_product" });
  api.markOrderStaged();

  assert.equal(api.flush(), true);
  assert.equal(sent.length, 1);

  const summary = JSON.parse(sent[0]!) as Record<string, unknown>;
  assert.equal(summary.telemetry_id, "abcdefghijklmnopqrstu");
  assert.equal(summary.started_hour, "2026-09-20T13");
  assert.deepEqual(summary.tools, {
    search_products: { ok: 1, err: {} },
    add_to_cart: { ok: 0, err: { unseen_product: 1 } },
  });
  // 発話本文やツールの引数は形として持たない
  assert.equal(JSON.stringify(summary).includes("content"), false);
});

test("送信の可否はこの 1 つの判定だけで決まる", () => {
  assert.equal(shouldSend({ enabled: true, statsConsent: true }), true);
  assert.equal(shouldSend({ enabled: true, statsConsent: false }), false);
  assert.equal(shouldSend({ enabled: false, statsConsent: true }), false);
  assert.equal(shouldSend({ enabled: false, statsConsent: false }), false);
});
