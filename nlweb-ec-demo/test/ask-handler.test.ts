import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, memoryStore, unavailableStore } from "@aclab/demo-guard";
import { createAskHandler } from "../app/api/ask-handler.ts";
import type { NlwebUpstream } from "../app/api/nlweb.ts";

const upstream: NlwebUpstream = { origin: "http://nlweb.test", secret: "s3cret", site: "aclab", timeoutMs: 1_000 };
const config = loadConfig({ DEMO_NAME: "nlweb-test" });

function handler(fetchImpl: typeof fetch, enabled = true) {
  return createAskHandler({ store: memoryStore(), config, upstream, log: () => {}, enabled: () => enabled, fetchImpl });
}

function post(body: unknown) {
  return new Request("http://demo.test/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

/** 上流の SSE を模す。1 メッセージ 1 data 行 */
function upstreamReturning(messages: unknown[], captured: { url?: string } = {}): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    captured.url = String(url);
    const body = messages.map((message) => `data: ${JSON.stringify(message)}`).join("\n\n");
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
}

test("should_return_503_when_disabled", async () => {
  const response = await handler(upstreamReturning([]), false)(post({ query: "緑茶" }));
  assert.equal(response.status, 503);
});

test("should_return_400_for_an_empty_query", async () => {
  const response = await handler(upstreamReturning([]))(post({ query: "   " }));
  assert.equal(response.status, 400);
});

test("should_forward_site_and_the_list_mode_as_none_in_both_mode_params", async () => {
  const captured: { url?: string } = {};
  const response = await handler(upstreamReturning([], captured))(post({ query: "渋みの少ない緑茶", prev: ["前の質問"] }));
  assert.equal(response.status, 200);
  const url = new URL(captured.url ?? "");
  assert.equal(url.pathname, "/ask");
  assert.equal(url.searchParams.get("site"), "aclab");
  assert.equal(url.searchParams.get("streaming"), null);
  assert.equal(url.searchParams.get("mode"), "none");
  assert.equal(url.searchParams.get("generate_mode"), "none");
  assert.equal(url.searchParams.get("prev"), "前の質問");
});

test("should_normalize_items_from_the_upstream_messages", async () => {
  const messages = [
    {
      message_type: "result",
      content: [
        {
          url: "https://nlweb.demo.agentic-commerce-lab.jp/products/tea-gyokuro-50g",
          name: "玉露 50g",
          site: "aclab",
          score: 88,
          description: "渋みが控えめ",
          schema_object: { offers: { price: 2800, availability: "https://schema.org/InStock" } },
        },
      ],
    },
  ];
  const response = await handler(upstreamReturning(messages))(post({ query: "渋みの少ない緑茶" }));
  const body = (await response.json()) as { items: { name: string; price_jpy?: number; in_stock?: boolean }[] };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].name, "玉露 50g");
  assert.equal(body.items[0].price_jpy, 2800);
  assert.equal(body.items[0].in_stock, true);
});

test("should_return_502_when_the_upstream_fails", async () => {
  const failing = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const response = await handler(failing)(post({ query: "緑茶" }));
  assert.equal(response.status, 502);
});

test("should_return_503_without_calling_upstream_when_the_store_is_unavailable", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response("", { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  const run = createAskHandler({ store: unavailableStore(), config, upstream, log: () => {}, enabled: () => true, fetchImpl: spy });
  const response = await run(post({ query: "緑茶" }));
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "store_unavailable");
  assert.equal(called, false);
});
