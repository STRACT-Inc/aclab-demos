import assert from "node:assert/strict";
import test from "node:test";
import { findReviews, products } from "../core/data.ts";
import {
  jsonLdScript,
  nlwebJsonlLine,
  productJsonLd,
  SCHEMA_OUT_OF_STOCK,
  withReviews,
} from "../core/jsonld.ts";

const ORIGIN = "https://example.test";

test("should_include_google_required_fields_for_every_product", () => {
  for (const product of products) {
    const ld = productJsonLd(product, findReviews(product.id), ORIGIN);
    assert.equal(ld["@type"], "Product");
    assert.ok(ld.name.length > 0);
    assert.match(ld.image, /^https:\/\/example\.test\/products\/[a-z0-9-]+\/image\.svg$/);
    assert.equal(typeof ld.offers.price, "number");
    assert.equal(ld.offers.priceCurrency, "JPY");
  }
});

test("should_mark_out_of_stock_products_with_schema_availability", () => {
  const kettle = products.find((product) => product.id === "kitchen-drip-kettle");
  assert.ok(kettle);
  assert.equal(productJsonLd(kettle, [], ORIGIN).offers.availability, SCHEMA_OUT_OF_STOCK);
});

test("should_write_one_tab_separated_line_whose_url_matches_the_json", () => {
  const ld = productJsonLd(products[0], findReviews(products[0].id), ORIGIN);
  const line = nlwebJsonlLine(ld);
  const [url, json, extra] = line.split("\t");
  assert.equal(extra, undefined);
  assert.equal(JSON.parse(json).url, url);
  assert.ok(!line.includes("\n"));
});

test("should_escape_closing_script_tags_in_json_ld_script", () => {
  assert.ok(!jsonLdScript({ name: "</script><script>alert(1)" }).includes("</"));
});

test("should_exclude_reviews_by_default_and_include_them_with_the_variant", () => {
  const gyokuro = products.find((product) => product.id === "tea-gyokuro-50g");
  assert.ok(gyokuro);
  const reviews = findReviews(gyokuro.id);
  const ld = productJsonLd(gyokuro, reviews, ORIGIN);
  assert.equal(ld.review, undefined);
  assert.equal(ld.aggregateRating?.reviewCount, reviews.length);
  assert.equal(withReviews(ld, reviews).review?.length, reviews.length);
});
