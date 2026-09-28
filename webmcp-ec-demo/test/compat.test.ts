import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTool,
  NAVIGATED,
  normalizeRegisteredTool,
  parseToolResult,
  resetExecuteStyle,
  untilUnregistered,
} from "../webmcp/compat.ts";
import type { ModelContext, RegisteredTool } from "../webmcp/types.ts";

/**
 * 互換層。
 * 既定の形は 2026-09-14 に Chrome 152(native)で実測したもの。ほかのマイルストーンや
 * polyfill では違う形もあり得るので、呼び分けの筋道をここで押さえる。
 */

const tool: RegisteredTool = { name: "get_cart" };

interface Call {
  target: RegisteredTool | string;
  args: unknown;
}

/** 呼ばれ方を記録する偽の modelContext */
function fakeContext(options: {
  /** JSON 文字列の引数を拒む(object しか受け取らない実装) */
  rejectStringArgs?: boolean;
  result: unknown;
}): ModelContext & { calls: Call[] } {
  const calls: Call[] = [];
  const context = {
    calls,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    async registerTool() {},
    async getTools() {
      return [tool];
    },
    async executeTool(target: RegisteredTool | string, args: unknown) {
      calls.push({ target, args });
      if (options.rejectStringArgs && typeof args === "string") {
        throw new TypeError("expected an object");
      }
      return options.result;
    },
  };
  return context as unknown as ModelContext & { calls: Call[] };
}

/** getTools() だけを差し替えた最小の context */
function contextWithTools(getTools: () => Promise<RegisteredTool[]>): ModelContext {
  return {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    async registerTool() {},
    getTools,
    async executeTool() {},
  } as unknown as ModelContext;
}

test("inputSchema が JSON 文字列で来ても object に直す(Chrome 152 の実測)", () => {
  const normalized = normalizeRegisteredTool({
    name: "search_products",
    inputSchema: '{"type":"object","properties":{"query":{"type":"string"}}}',
  });

  assert.deepEqual(normalized.inputSchema, {
    type: "object",
    properties: { query: { type: "string" } },
  });
});

test("壊れた schema でもツールを落とさない", () => {
  const normalized = normalizeRegisteredTool({ name: "broken", inputSchema: "{ not json" });
  assert.deepEqual(normalized.inputSchema, { type: "object", properties: {} });
});

test("二重に包まれた戻り値を解く(JSON 文字列 → content → text → ツールの JSON)", () => {
  const wire = JSON.stringify({
    content: [{ type: "text", text: JSON.stringify({ total_jpy: 6400 }) }],
  });
  assert.deepEqual(parseToolResult(wire), { total_jpy: 6400 });
});

test("content ブロックが object で来る形も解く", () => {
  const parsed = parseToolResult({
    content: [{ type: "text", text: '{"ok":true,"total_jpy":6400}' }],
  });
  assert.deepEqual(parsed, { ok: true, total_jpy: 6400 });
});

test("JSON として読めない文字列はそのまま返す", () => {
  assert.equal(parseToolResult("カートに入れました"), "カートに入れました");
});

test("null はナビゲーションが起きた合図として扱う", () => {
  assert.deepEqual(parseToolResult(null), NAVIGATED);
  assert.deepEqual(parseToolResult(undefined), NAVIGATED);
});

test("Chrome 152 の形(RegisteredTool + JSON 文字列)で呼べる", async () => {
  resetExecuteStyle();
  const context = fakeContext({
    result: JSON.stringify({ content: [{ type: "text", text: '{"ok":true}' }] }),
  });

  const result = await executeTool(context, tool, { product_id: "tea-gyokuro-50g" });

  assert.deepEqual(result, { ok: true });
  assert.equal(context.calls.length, 1, "1 回で通る");
  assert.deepEqual(context.calls[0], {
    target: tool,
    args: '{"product_id":"tea-gyokuro-50g"}',
  });
});

test("JSON 文字列を拒む実装では object で呼び直し、その形を覚える", async () => {
  resetExecuteStyle();
  const context = fakeContext({
    rejectStringArgs: true,
    result: { content: [{ type: "text", text: '{"ok":true}' }] },
  });

  await executeTool(context, tool, {});
  assert.equal(context.calls.length, 2, "文字列で失敗し、object で通る");
  assert.deepEqual(context.calls[1]?.args, {});

  await executeTool(context, tool, {});
  assert.equal(context.calls.length, 3, "2 回目は覚えた形で 1 回だけ");
});

test("中断(AbortError)は呼び方の問題ではないので、そのまま返す", async () => {
  resetExecuteStyle();
  const context = contextWithTools(async () => [tool]);
  context.executeTool = async () => {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };

  await assert.rejects(() => executeTool(context, tool, {}), /aborted/);
});

test("どの呼び方でも通らなければ、最後のエラーを返す", async () => {
  resetExecuteStyle();
  const context = contextWithTools(async () => [tool]);
  context.executeTool = async () => {
    throw new Error("この実装では呼べません");
  };

  await assert.rejects(() => executeTool(context, tool, {}), /この実装では呼べません/);
});

test("登録解除が終わるまで待つ(abort は非同期)", async () => {
  let reads = 0;
  const context = contextWithTools(async () => {
    reads += 1;
    // 2 回目までは残っていて、3 回目で消える
    return reads < 3 ? [tool] : [];
  });

  assert.equal(await untilUnregistered(context, ["get_cart"], { intervalMs: 1 }), true);
  assert.equal(reads, 3);
});

test("待ちきれなければ false を返す(呼び出し側は先へ進む)", async () => {
  const context = contextWithTools(async () => [tool]);

  assert.equal(
    await untilUnregistered(context, ["get_cart"], { timeoutMs: 20, intervalMs: 5 }),
    false,
  );
});
