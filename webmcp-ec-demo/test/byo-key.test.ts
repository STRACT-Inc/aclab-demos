import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../state/keys.ts";

/**
 * BYO キーモード。
 * 公開時は経路ごと無いこと、キーの送り先が api.anthropic.com だけであること、
 * 直接呼びの応答が /api/chat と同じイベントに直ることを押さえる。
 */

/** sessionStorage の代わり */
function fakeWindow(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    store,
  };
}

async function loadByoKey(enabled: boolean) {
  process.env.NEXT_PUBLIC_BYO_KEY_ENABLED = enabled ? "true" : "false";
  // モジュールの読み込み時にフラグを固めるので、条件ごとに読み直す
  return import(`../chat/byo-key.ts?enabled=${enabled}`);
}

test("公開時(フラグ off)はキーが保存されていても読まない", async () => {
  const byo = await loadByoKey(false);
  const win = fakeWindow({ [STORAGE_KEYS.byoKey]: "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx" });
  (globalThis as { window?: unknown }).window = win;
  try {
    assert.equal(byo.BYO_KEY_ENABLED, false);
    assert.equal(byo.readByoKey(), null);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("フラグ on なら sessionStorage から読み書きできる", async () => {
  const byo = await loadByoKey(true);
  const win = fakeWindow();
  (globalThis as { window?: unknown }).window = win;
  try {
    assert.equal(byo.readByoKey(), null);
    byo.writeByoKey("  sk-ant-api03-abcdefghijklmnopqrstuvwx  ");
    assert.equal(byo.readByoKey(), "sk-ant-api03-abcdefghijklmnopqrstuvwx");
    // リセットで消せるように、state/keys.ts と同じ名前で置く
    assert.ok(win.store.has(STORAGE_KEYS.byoKey));
    byo.clearByoKey();
    assert.equal(byo.readByoKey(), null);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("キーらしくない文字列は保存ボタンを出さない", async () => {
  const byo = await loadByoKey(true);
  assert.equal(byo.looksLikeKey("sk-ant-api03-abcdefghijklmnopqrstuvwx"), true);
  assert.equal(byo.looksLikeKey("sk-ant-short"), false);
  assert.equal(byo.looksLikeKey("hello"), false);
  assert.equal(byo.looksLikeKey(""), false);
});

/** Anthropic の SSE をそのまま流す偽の fetch */
function sseResponse(events: { event: string; data: unknown }[]): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  return new Response(body, { status: 200 });
}

test("直接呼びの応答が /api/chat と同じイベントに直る", async () => {
  const { streamDirect } = await import("../chat/direct.ts");
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return sseResponse([
      { event: "message_start", data: { message: { usage: { input_tokens: 120 } } } },
      { event: "content_block_start", data: { index: 0, content_block: { type: "text" } } },
      { event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text: "探し" } } },
      { event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text: "ます" } } },
      { event: "content_block_stop", data: { index: 0 } },
      {
        event: "content_block_start",
        data: { index: 1, content_block: { type: "tool_use", id: "call_1", name: "search_products" } },
      },
      {
        event: "content_block_delta",
        data: { index: 1, delta: { type: "input_json_delta", partial_json: '{"query":' } },
      },
      {
        event: "content_block_delta",
        data: { index: 1, delta: { type: "input_json_delta", partial_json: '"日本茶"}' } },
      },
      { event: "content_block_stop", data: { index: 1 } },
      { event: "message_delta", data: { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } } },
    ]);
  }) as typeof globalThis.fetch;

  try {
    const seen: { event: string; data: unknown }[] = [];
    for await (const message of streamDirect(
      { model: "m", max_tokens: 600, system: [], tools: [], messages: [] },
      { apiKey: "sk-ant-test", signal: new AbortController().signal },
    )) {
      seen.push(message);
    }

    assert.deepEqual(
      seen.map((m) => m.event),
      ["text_delta", "text_delta", "tool_use", "usage", "done"],
    );
    assert.deepEqual(seen[2].data, {
      id: "call_1",
      name: "search_products",
      input: { query: "日本茶" },
    });
    assert.deepEqual(seen[3].data, {
      input_tokens: 120,
      output_tokens: 42,
      cache_read_input_tokens: 0,
    });

    // 送り先は Anthropic だけ。キーはヘッダーにだけ入り、本文には入らない
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "sk-ant-test");
    assert.equal(headers["anthropic-dangerous-direct-browser-access"], "true");
    assert.equal(String(calls[0].init.body).includes("sk-ant-test"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("401 はキーの入れ直しが分かるコードで返す", async () => {
  const { streamDirect } = await import("../chat/direct.ts");
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), {
      status: 401,
    })) as typeof globalThis.fetch;
  try {
    const seen: { event: string; data: unknown }[] = [];
    for await (const message of streamDirect(
      { model: "m", max_tokens: 600, system: [], tools: [], messages: [] },
      { apiKey: "sk-ant-bad", signal: new AbortController().signal },
    )) {
      seen.push(message);
    }
    assert.deepEqual(seen.map((m) => m.event), ["error"]);
    assert.equal((seen[0].data as { code: string }).code, "byo_key_invalid");
  } finally {
    globalThis.fetch = original;
  }
});
