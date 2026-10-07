import assert from "node:assert/strict";
import test from "node:test";
import { inStockOf, normalizeAskMessages, priceOf } from "../core/nlweb-response.ts";
import { parseSse } from "../core/nlweb-sse.ts";

function item(url: string, score: number, price: number | string, availability: string) {
  return {
    "@type": "Item",
    url,
    name: url,
    site: "aclab",
    score,
    description: "d",
    schema_object: { offers: { price, availability } },
  };
}

test("should_collect_items_across_result_messages_sorted_by_score_without_duplicates", () => {
  const result = normalizeAskMessages([
    { message_type: "begin-nlweb-response", content: {} },
    {
      message_type: "result",
      content: [
        item("u1", 60, 2800, "https://schema.org/InStock"),
        item("u2", 90, "1,800", "https://schema.org/OutOfStock"),
      ],
    },
    { message_type: "result", content: [item("u1", 60, 2800, "https://schema.org/InStock")] },
    { message_type: "end-nlweb-response", content: {} },
  ]);
  assert.deepEqual(
    result.items.map((entry) => entry.url),
    ["u2", "u1"],
  );
  assert.equal(result.items[1].price_jpy, 2800);
  assert.equal(result.items[1].in_stock, true);
  assert.equal(result.items[0].price_jpy, 1800);
  assert.equal(result.items[0].in_stock, false);
  assert.equal(result.tool, "search");
  assert.equal(result.answered, true);
});

test("should_read_summary_no_results_and_error_messages", () => {
  const result = normalizeAskMessages([
    { message_type: "result", "@type": "Summary", content: "まとめ" },
    { message_type: "no_results", content: {} },
    { message_type: "error", content: { message: "boom" } },
  ]);
  assert.equal(result.summary, "まとめ");
  assert.equal(result.no_results, true);
  assert.deepEqual(result.errors, ["boom"]);
});

test("should_read_item_details_as_an_answered_item", () => {
  const result = normalizeAskMessages([
    { message_type: "intermediate_message", content: "Searching for 玉露" },
    {
      message_type: "item_details",
      name: "玉露 50g",
      details: "60度ほどのぬるめの湯で2〜3分かけて淹れると、甘みがはっきり出ます。",
      score: 90,
      url: "https://x/products/tea-gyokuro-50g",
      site: "aclab",
      schema_object: { offers: { price: 2800, availability: "https://schema.org/InStock" } },
    },
  ]);
  assert.equal(result.tool, "details");
  assert.equal(result.details?.score, 90);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, result.details?.text);
  assert.equal(result.items[0].price_jpy, 2800);
});

test("should_read_compare_items_even_after_the_end_message", () => {
  const result = normalizeAskMessages([
    { message_type: "end-nlweb-response", content: {} },
    {
      message_type: "compare_items",
      comparison: "玉露は60度、煎茶は70度前後で淹れます。",
      item1: { name: "玉露 50g", url: "https://x/products/tea-gyokuro-50g", schema_object: {} },
      item2: { name: "煎茶 100g", url: "https://x/products/tea-sencha-100g", schema_object: {} },
    },
  ]);
  assert.equal(result.tool, "compare");
  assert.deepEqual(
    result.comparison?.items.map((entry) => entry.name),
    ["玉露 50g", "煎茶 100g"],
  );
  assert.equal(result.items.length, 2);
});

test("should_parse_a_json_string_schema_object_from_compare_items", () => {
  const result = normalizeAskMessages([
    {
      message_type: "compare_items",
      comparison: "比較",
      item1: {
        name: "玉露 50g",
        url: "https://x/products/tea-gyokuro-50g",
        schema_object: JSON.stringify({ offers: { price: 2800, availability: "https://schema.org/InStock" } }),
      },
      item2: { name: "煎茶 100g", url: "https://x/products/tea-sencha-100g", schema_object: "not json" },
    },
  ]);
  assert.equal(result.items.find((entry) => entry.name === "玉露 50g")?.price_jpy, 2800);
  assert.equal(result.items.find((entry) => entry.name === "煎茶 100g")?.price_jpy, undefined);
});

test("should_read_generated_answers_with_their_items", () => {
  const result = normalizeAskMessages([
    { message_type: "nlws", "@type": "GeneratedAnswer", answer: "玉露がおすすめです。", items: [item("u1", 80, 2800, "https://schema.org/InStock")] },
  ]);
  assert.equal(result.tool, "generate");
  assert.equal(result.answer, "玉露がおすすめです。");
  assert.equal(result.items.length, 1);
});

test("should_report_nothing_answered_for_an_empty_stream", () => {
  const result = normalizeAskMessages([
    { message_type: "query_rewrite", content: "" },
    { message_type: "end-nlweb-response", content: {} },
  ]);
  assert.equal(result.answered, false);
  assert.equal(result.tool, "none");
});

test("should_parse_sse_data_lines_and_skip_comments_and_broken_lines", () => {
  const text = [
    ": keepalive",
    'data: {"message_type":"begin-nlweb-response"}',
    "",
    "data: not json",
    'data: {"message_type":"result","content":[]}',
  ].join("\n");
  assert.deepEqual(
    parseSse(text).map((message) => message.message_type),
    ["begin-nlweb-response", "result"],
  );
});

test("should_return_undefined_when_offers_are_missing", () => {
  assert.equal(priceOf({}), undefined);
  assert.equal(inStockOf(undefined), undefined);
});
