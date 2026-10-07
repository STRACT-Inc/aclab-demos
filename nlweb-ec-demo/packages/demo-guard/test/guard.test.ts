import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { chatRequestSchema, createChatHandler, isNewTurn, trimContext, type ModelClient } from "../src/chat.ts";
import { loadConfig, type GuardConfig } from "../src/config.ts";
import { keys } from "../src/keys.ts";
import { DROPPED, sanitize, type Logger } from "../src/log.ts";
import { issueChatSession } from "../src/session.ts";
import { memoryStore, type Store } from "../src/store.ts";
import { createTelemetryHandler } from "../src/telemetry.ts";
import { normalizeTool, TOOL_SCHEMA_MAX_CHARS, TOOLS_TOTAL_MAX_CHARS } from "../src/tool-schema.ts";

/** テスト用の設定。上限は小さくして境目を確かめやすくする */
function testConfig(overrides: Partial<GuardConfig> = {}): GuardConfig {
  return {
    ...loadConfig({ DEMO_NAME: "test", IP_HASH_SECRET: "test-secret" }),
    ...overrides,
  };
}

/** 呼ばれた回数を数える偽のモデル。Anthropic は呼ばない */
function fakeModel(options: { text?: string; toolUses?: { id: string; name: string }[] } = {}) {
  const text = options.text ?? "はい";
  const toolUses = options.toolUses ?? [];
  let calls = 0;
  const client: ModelClient = {
    stream() {
      calls += 1;
      const events = [
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        } as unknown as Anthropic.MessageStreamEvent,
      ];
      return {
        async *[Symbol.asyncIterator]() {
          for (const event of events) yield event;
        },
        async finalMessage() {
          return {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "test-model",
            content: [
              { type: "text", text },
              ...toolUses.map((tool) => ({ type: "tool_use", ...tool, input: {} })),
            ],
            stop_reason: toolUses.length > 0 ? "tool_use" : "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          } as unknown as Anthropic.Message;
        },
      };
    },
  };
  return { client, calls: () => calls };
}

/** ストアに届かない状態 */
const failingStore: Store = {
  async incr() {
    throw new Error("store unavailable");
  },
  async hcreate() {
    throw new Error("store unavailable");
  },
  async hincr() {
    throw new Error("store unavailable");
  },
  async hset() {
    throw new Error("store unavailable");
  },
  async hgetall() {
    throw new Error("store unavailable");
  },
  async set() {
    throw new Error("store unavailable");
  },
};

function collectingLogger() {
  const entries: { event: string; fields: Record<string, unknown> }[] = [];
  const logger: Logger = (event, fields = {}) => entries.push({ event, fields });
  return { logger, entries };
}

const chatRequest = (sessionId: string, text: string) =>
  new Request("https://demo.test/api/chat", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({
      chat_session_id: sessionId,
      messages: [{ role: "user", content: [{ type: "text", text }] }],
      tools: [],
    }),
  });

const validSummary = {
  schema: 1,
  consent_version: "2026-09",
  telemetry_id: "abcdefghijklmnopqrstu",
  started_hour: "2026-09-20T13",
  from_article: true,
  browser: { brand: "chrome", major: 153, mobile: false },
  webmcp: { mode: "native", ot_token_present: true, tools_max: 12 },
  chat: {
    opened: true,
    turns: 5,
    iterations: 11,
    stopped_by: { done: 4, limit: 1, abort: 0 },
    model_latency_ms_bucket: { "<2s": 6 },
  },
  tools: { search_products: { ok: 3, err: {} } },
  external_tool_calls: 0,
  declarative_activated: 1,
  scenarios: { "gift-tea": "pass" },
  order: { staged: 1, confirmed_by_user: 1 },
  lab: { hint_ignored: false, description_lang: "ja" },
};

const telemetryRequest = (body: unknown) =>
  new Request("https://demo.test/api/telemetry", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const catalog = { toolNames: ["search_products", "add_to_cart"], scenarioIds: ["gift-tea"] };

test("統計は既定で無効で、無効のときは 404 を返して何も保存しない", async () => {
  const store = memoryStore();
  const config = testConfig();
  assert.equal(config.telemetryEnabled, false);

  const handler = createTelemetryHandler({ store, config, catalog, logger: () => {} });
  const res = await handler(telemetryRequest(validSummary));

  assert.equal(res.status, 404);
  assert.equal(await store.hgetall(keys.telemetrySummary("test", "2026-09", "x")), null);
});

test("統計が有効なら要約を保存し、カタログに無いツール名は 400 で弾く", async () => {
  const store = memoryStore();
  const config = testConfig({ telemetryEnabled: true });
  const handler = createTelemetryHandler({ store, config, catalog, logger: () => {} });

  const ok = await handler(telemetryRequest(validSummary));
  assert.equal(ok.status, 204);

  const unknownTool = {
    ...validSummary,
    tools: { ...validSummary.tools, evil_tool: { ok: 1, err: {} } },
  };
  const rejected = await handler(telemetryRequest(unknownTool));
  assert.equal(rejected.status, 400);
});

test("要約がサイズ上限を超えたら 413 で受け取らない", async () => {
  const store = memoryStore();
  const config = testConfig({ telemetryEnabled: true, telemetryMaxBytes: 64 });
  const handler = createTelemetryHandler({ store, config, catalog, logger: () => {} });

  const res = await handler(telemetryRequest(validSummary));
  assert.equal(res.status, 413);
});

test("同じストアを共有する 2 つのハンドラの合計で日次上限に達する", async () => {
  const store = memoryStore();
  const config = testConfig({ dailyModelCalls: 2 });
  const first = fakeModel();
  const second = fakeModel();
  const deps = { store, config, systemPrompt: "テスト", logger: () => {} };
  const handlerA = createChatHandler({ ...deps, model: first.client });
  const handlerB = createChatHandler({ ...deps, model: second.client });

  const sessionA = await issueChatSession(store, config);
  const sessionB = await issueChatSession(store, config);

  assert.equal((await handlerA(chatRequest(sessionA.chatSessionId, "1 本目"))).status, 200);
  assert.equal((await handlerB(chatRequest(sessionB.chatSessionId, "2 本目"))).status, 200);

  const third = await handlerA(chatRequest(sessionA.chatSessionId, "3 本目"));
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error.code, "daily_limit");
  assert.equal(first.calls() + second.calls(), 2);
});

test("ストアに届かないときはモデルを呼ばずに 503 を返す", async () => {
  const config = testConfig();
  const model = fakeModel();
  const handler = createChatHandler({
    store: failingStore,
    config,
    model: model.client,
    systemPrompt: "テスト",
    logger: () => {},
  });

  const res = await handler(chatRequest("abcdefghijklmnopqrstu", "こんにちは"));

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "store_unavailable");
  assert.equal(model.calls(), 0);
});

test("ログに発話本文とツールの引数・結果を出さない", async () => {
  const store = memoryStore();
  const config = testConfig();
  const model = fakeModel({ text: "在庫はあります", toolUses: [{ id: "t1", name: "get_cart" }] });
  const { logger, entries } = collectingLogger();
  const handler = createChatHandler({
    store,
    config,
    model: model.client,
    systemPrompt: "テスト",
    logger,
  });

  const secret = "山田太郎 090-0000-0000 神奈川県横浜市中区本町 1-2-3";
  const session = await issueChatSession(store, config);
  const res = await handler(chatRequest(session.chatSessionId, secret));
  await res.text();

  const logged = JSON.stringify(entries);
  assert.equal(logged.includes(secret), false);
  assert.equal(logged.includes("山田"), false);
  assert.ok(entries.some((entry) => entry.event === "chat_done"));
});

test("ログの値は識別子だけを通し、長い文字列は落とす", () => {
  const fields = sanitize({
    reason: "daily_limit",
    count: 12,
    ok: true,
    body: "読者が入力した住所や氏名のような長い文章はここに入れない",
    "bad key": "x",
  });

  assert.deepEqual(fields, { reason: "daily_limit", count: 12, ok: true, body: DROPPED });
});

test("新しい発話かどうかを messages の末尾で判定する", () => {
  assert.equal(isNewTurn([{ role: "user", content: [{ type: "text", text: "探して" }] }]), true);
  assert.equal(
    isNewTurn([
      { role: "user", content: [{ type: "text", text: "探して" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "search", input: {} }] },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"items\":[]}" }],
      },
    ]),
    false,
  );
});

test("文脈は古いツール結果から削り、先頭が user のまま残る", () => {
  const messages = [
    { role: "user" as const, content: [{ type: "text" as const, text: "1 つ目の指示" }] },
    {
      role: "assistant" as const,
      content: [{ type: "tool_use" as const, id: "t1", name: "search", input: {} }],
    },
    {
      role: "user" as const,
      content: [{ type: "tool_result" as const, tool_use_id: "t1", content: "x".repeat(5_000) }],
    },
    { role: "assistant" as const, content: [{ type: "text" as const, text: "見つかりました" }] },
    { role: "user" as const, content: [{ type: "text" as const, text: "2 つ目の指示" }] },
  ];

  const trimmed = trimContext(messages, 1_000);

  assert.equal(trimmed[0]?.role, "user");
  assert.ok(JSON.stringify(trimmed).length < 1_500);
  assert.equal(JSON.stringify(trimmed).includes("x".repeat(100)), false);
});

/** 形の合う最小のリクエスト。tools と messages を差し替えて境目を見る */
const wireRequest = (overrides: Record<string, unknown>) => ({
  chat_session_id: "abcdefghijklmnopqrstu",
  messages: [{ role: "user", content: [{ type: "text", text: "こんにちは" }] }],
  tools: [],
  ...overrides,
});

test("tool_use.input と input_schema は JSON の長さで上限を掛ける", () => {
  const tool = (schema: unknown) => ({ name: "t", description: "", input_schema: schema });
  const padding = (chars: number) => ({ type: "object", pad: "あ".repeat(chars) });

  assert.ok(chatRequestSchema.safeParse(wireRequest({ tools: [tool(padding(1_000))] })).success);
  assert.equal(
    chatRequestSchema.safeParse(wireRequest({ tools: [tool(padding(TOOL_SCHEMA_MAX_CHARS))] }))
      .success,
    false,
  );

  const toolUse = (input: unknown) =>
    wireRequest({
      messages: [
        { role: "user", content: "探して" },
        { role: "assistant", content: [{ type: "tool_use", id: "u1", name: "t", input }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: "{}" }] },
      ],
    });
  assert.ok(chatRequestSchema.safeParse(toolUse({ q: "紅茶" })).success);
  assert.equal(chatRequestSchema.safeParse(toolUse({ q: "あ".repeat(10_000) })).success, false);
});

test("tools は件数の上限内でも合計の JSON が上限を超えたら弾く", () => {
  const each = Math.floor(TOOL_SCHEMA_MAX_CHARS * 0.9);
  const tools = Array.from({ length: 10 }, (_, i) => ({
    name: `t${i}`,
    input_schema: { type: "object", pad: "a".repeat(each) },
  }));
  assert.ok(tools.length * each > TOOLS_TOTAL_MAX_CHARS);
  assert.equal(chatRequestSchema.safeParse(wireRequest({ tools })).success, false);
});

test("ツール宣言の未知のキーは落とす", () => {
  const parsed = chatRequestSchema.safeParse(
    wireRequest({ tools: [{ name: "t", input_schema: { type: "object" }, extra: "x".repeat(100) }] }),
  );
  assert.ok(parsed.success);
  assert.equal("extra" in (parsed.data.tools[0] ?? {}), false);
});

test("宣言形フォームの schema を Anthropic の形に直す", () => {
  const normalized = normalizeTool({
    name: "shipping_address_form",
    description: "配送先",
    input_schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        prefecture: {
          anyOf: [
            { const: "神奈川県", title: "神奈川県" },
            { const: "東京都", title: "東京都" },
          ],
        },
        note: { type: "string", description: "あ".repeat(300) },
      },
    },
  });

  const properties = normalized.input_schema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(properties.prefecture?.enum, ["神奈川県", "東京都"]);
  assert.equal("anyOf" in (properties.prefecture ?? {}), false);
  assert.equal(("$schema" in normalized.input_schema) as boolean, false);
  assert.ok((properties.note?.description as string).length <= 151);
});

test("本番で IP_HASH_SECRET が無ければ起動時に落ちる", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /IP_HASH_SECRET/);
});
