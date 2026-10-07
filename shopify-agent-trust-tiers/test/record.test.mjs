import test from "node:test";
import assert from "node:assert/strict";
import { parseMcpBody, summarize } from "../lib/mcp.mjs";
import { redactText } from "../lib/redact.mjs";

test("should_hide_store_and_credentials_before_a_log_is_written", () => {
  const options = { shopDomain: "my-store.myshopify.com", secrets: ["s3cret"] };
  const cases = [
    {
      input: "https://my-store.myshopify.com/cart/c/abc?key=xyz789",
      output: "https://{shop-domain}/cart/c/abc?key={redacted}",
    },
    { input: "authorization: Bearer eyJhbGciOi.payload.sig", output: "authorization: Bearer {redacted}" },
    { input: "signature: sig1=:MEUCIQ+/abc=:", output: "signature: sig1=:{redacted}:" },
    { input: '{"client_secret":"s3cret"}', output: '{"client_secret":"{redacted}"}' },
  ];

  for (const { input, output } of cases) assert.equal(redactText(input, options), output);
});

test("should_read_the_last_data_line_when_the_server_answers_with_sse", () => {
  const cases = [
    { contentType: "application/json", text: '{"id":1}', output: { id: 1 } },
    {
      contentType: "text/event-stream",
      text: 'event: message\ndata: {"id":1}\n\nevent: message\ndata: {"id":2}\n\n',
      output: { id: 2 },
    },
    { contentType: "text/html", text: "<html>blocked</html>", output: { unparsed: "<html>blocked</html>" } },
  ];

  for (const { contentType, text, output } of cases) assert.deepEqual(parseMcpBody(contentType, text), output);
});

test("should_separate_transport_refusals_from_checkout_outcomes", () => {
  const cases = [
    {
      // 認証やレート制限で処理されなかった場合は JSON-RPC の error で返る
      input: { error: { code: -32000, message: "Unauthorized" } },
      output: { rpcError: { code: -32000, message: "Unauthorized", data: undefined } },
    },
    {
      // 処理された場合は、買い手への引き継ぎが必要でも result で返る
      input: {
        result: {
          structuredContent: {
            checkout: {
              id: "gid://shopify/Checkout/1",
              status: "requires_escalation",
              continue_url: "https://shop.example.com/checkouts/1",
              messages: [{ type: "error", code: "payment_required", severity: "requires_buyer_input" }],
            },
          },
        },
      },
      output: {
        isError: false,
        resource: "checkout",
        id: "gid://shopify/Checkout/1",
        status: "requires_escalation",
        continueUrl: "https://shop.example.com/checkouts/1",
        messages: [
          { type: "error", code: "payment_required", severity: "requires_buyer_input", content: undefined },
        ],
        totals: null,
      },
    },
  ];

  for (const { input, output } of cases) assert.deepEqual(summarize(input), output);
});
