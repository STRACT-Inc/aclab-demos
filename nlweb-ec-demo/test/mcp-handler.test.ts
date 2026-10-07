import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, memoryStore, unavailableStore } from "@aclab/demo-guard";
import { createMcpHandler, injectSite } from "../app/api/mcp-handler.ts";
import type { NlwebUpstream } from "../app/api/nlweb.ts";

const upstream: NlwebUpstream = { origin: "http://nlweb.test", secret: "s3cret", site: "aclab", timeoutMs: 1_000 };
const config = loadConfig({
  DEMO_NAME: "nlweb-test",
  GUARD_REQUEST_RATE_LIMIT: "1",
  GUARD_REQUEST_RATE_WINDOW_SECONDS: "600",
});

interface Captured {
  body?: string;
  authorization?: string;
}

function fakeFetch(captured: Captured): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    captured.body = init?.body as string;
    captured.authorization = (init?.headers as Record<string, string>).authorization;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function handler(captured: Captured = {}, injectSiteFlag = true) {
  return createMcpHandler({
    store: memoryStore(),
    config,
    upstream,
    log: () => {},
    injectSite: injectSiteFlag,
    fetchImpl: fakeFetch(captured),
  });
}

function post(body: unknown, ip = "203.0.113.1") {
  return new Request("http://demo.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function rpc(response: Response) {
  return (await response.json()) as { result?: unknown; error?: { code: number } };
}

test("should_reject_methods_outside_the_allow_list", async () => {
  const response = await handler()(post({ jsonrpc: "2.0", id: 1, method: "resources/list" }));
  assert.equal((await rpc(response)).error?.code, -32601);
});

test("should_answer_ping_locally_without_calling_upstream", async () => {
  const captured: Captured = {};
  const response = await handler(captured)(post({ jsonrpc: "2.0", id: 7, method: "ping" }));
  assert.deepEqual((await rpc(response)).result, {});
  assert.equal(captured.body, undefined);
});

test("should_accept_initialized_notification_with_202", async () => {
  const response = await handler()(post({ jsonrpc: "2.0", method: "notifications/initialized" }));
  assert.equal(response.status, 202);
});

test("should_inject_site_into_ask_and_forward_the_shared_secret", async () => {
  const captured: Captured = {};
  await handler(captured)(
    post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask", arguments: { query: "緑茶" } } }),
  );
  const forwarded = JSON.parse(captured.body ?? "{}") as { params: { arguments: { site?: string[] } } };
  assert.deepEqual(forwarded.params.arguments.site, ["aclab"]);
  assert.equal(captured.authorization, "Bearer s3cret");
});

test("should_keep_an_explicit_site_and_leave_other_tools_alone", () => {
  const withSite = injectSite(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask", arguments: { query: "q", site: ["x"] } } },
    "aclab",
  );
  assert.deepEqual((withSite.params?.arguments as { site: string[] }).site, ["x"]);
  const listSites = injectSite({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_sites" } }, "aclab");
  assert.equal(listSites.params?.arguments, undefined);
});

test("should_rate_limit_tools_call_per_ip", async () => {
  const run = handler();
  const call = () =>
    run(post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask", arguments: { query: "q" } } }));
  assert.equal((await call()).status, 200);
  const second = await call();
  assert.equal(second.status, 429);
  assert.equal((await rpc(second)).error?.code, -32000);
});

test("should_reject_batch_requests", async () => {
  const response = await handler()(post([{ jsonrpc: "2.0", id: 1, method: "ping" }]));
  assert.equal(response.status, 400);
});

test("should_return_503_for_tools_call_when_the_store_is_unavailable", async () => {
  const captured: Captured = {};
  const run = createMcpHandler({
    store: unavailableStore(),
    config,
    upstream,
    log: () => {},
    injectSite: true,
    fetchImpl: fakeFetch(captured),
  });
  const response = await run(
    post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask", arguments: { query: "q" } } }),
  );
  assert.equal(response.status, 503);
  assert.equal((await rpc(response)).error?.code, -32001);
  assert.equal(captured.body, undefined);
});
