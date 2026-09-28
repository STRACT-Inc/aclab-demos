import type { McpToolResult, ModelContext, RegisteredTool } from "./types.ts";

/**
 * 互換層。
 * Origin Trial のマイルストーンごとに公開型が揺れるため、ページ内エージェントと /lab は
 * 必ずここを通す。
 *
 * 2026-09-14 に Chrome 152(native)で実測した挙動:
 * - getTools() の inputSchema は JSON 文字列で来る
 * - executeTool は RegisteredTool を要求する。名前の文字列は TypeError
 * - 引数は JSON 文字列で渡す。object を渡すと UnknownError「Failed to parse input arguments」
 * - 引数は省略できない(2 引数必須)
 * - 戻り値は JSON 文字列。中身は MCP の content ブロックで、その text がツールの JSON
 * - abort() での登録解除は非同期。すぐ登録し直すと InvalidStateError「Duplicate tool name」
 *
 * polyfill やほかのマイルストーンでは違う形もあり得るので、呼び方は順に試して
 * 通った形を覚える。判定は毎晩のスモークで更新する。
 */

/** ナビゲーションが起きたときの戻り値(トップの検索フォーム) */
export const NAVIGATED = { navigated: true } as const;

/** executeTool の呼び方。1 度成功した形を覚えて使い回す */
export type ExecuteStyle = "tool+string" | "tool+object" | "name+string";

const STYLES: ExecuteStyle[] = ["tool+string", "tool+object", "name+string"];
let executeStyle: ExecuteStyle | null = null;

/** getTools() の結果を正規化する。inputSchema は必ず object にして返す */
export function normalizeRegisteredTool(tool: RegisteredTool): RegisteredTool {
  const schema = tool.inputSchema;
  if (typeof schema !== "string") return tool;
  try {
    return { ...tool, inputSchema: JSON.parse(schema) as object };
  } catch {
    // 壊れた文字列でもツール自体は使えるので、空の schema にして落とさない
    return { ...tool, inputSchema: { type: "object", properties: {} } };
  }
}

export async function getTools(context: ModelContext): Promise<RegisteredTool[]> {
  const tools = await context.getTools();
  return tools.map(normalizeRegisteredTool);
}

/**
 * ツールの戻り値をページ側の値に戻す。
 * 二重に包まれている(JSON 文字列 → content ブロック → text → ツールの JSON)ので、
 * 解けるところまで解く。
 */
export function parseToolResult(raw: unknown, depth = 0): unknown {
  if (raw === null || raw === undefined) return NAVIGATED;
  if (depth > 4) return raw;

  if (typeof raw === "object" && "content" in raw) {
    const blocks = (raw as McpToolResult).content;
    if (Array.isArray(blocks)) {
      const text = blocks
        .filter((block) => block?.type === "text")
        .map((block) => block.text)
        .join("\n");
      return parseToolResult(text, depth + 1);
    }
  }

  if (typeof raw === "string") {
    try {
      return parseToolResult(JSON.parse(raw), depth + 1);
    } catch {
      return raw;
    }
  }

  return raw;
}

function callWithStyle(
  context: ModelContext,
  style: ExecuteStyle,
  tool: RegisteredTool,
  args: object,
  options: { signal?: AbortSignal },
): Promise<unknown> {
  const payload = style === "tool+object" ? args : JSON.stringify(args);
  const target = style === "name+string" ? tool.name : tool;
  return context.executeTool(target, payload, options);
}

/**
 * ツールを呼ぶ。通った呼び方を覚え、次からは 1 回で済ませる。
 * ツール自身の失敗は戻り値(エラーの object)で返るので、ここで投げられるのは
 * 呼び方が合っていないときだけ、という前提で順に試す。
 */
export async function executeTool(
  context: ModelContext,
  tool: RegisteredTool,
  args: object,
  options: { signal?: AbortSignal } = {},
): Promise<unknown> {
  const styles = executeStyle ? [executeStyle] : STYLES;

  let lastError: unknown;
  for (const style of styles) {
    try {
      const raw = await callWithStyle(context, style, tool, args, options);
      executeStyle = style;
      return parseToolResult(raw);
    } catch (error) {
      // 中断は呼び方の問題ではないので、そのまま返す
      if ((error as Error | null)?.name === "AbortError") throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** 名前でツールを引く。呼び出し側は getTools() の結果を持っている前提 */
export function findTool(tools: RegisteredTool[], name: string): RegisteredTool | undefined {
  return tools.find((tool) => tool.name === name);
}

/**
 * 指定した名前が登録されていない状態になるまで待つ。
 * abort() の登録解除は非同期で、待たずに登録し直すと Duplicate tool name になる。
 */
export async function untilUnregistered(
  context: ModelContext,
  names: string[],
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  if (names.length === 0) return true;
  const timeoutMs = options.timeoutMs ?? 500;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  const wanted = new Set(names);

  for (;;) {
    const current = await context.getTools();
    if (!current.some((tool) => wanted.has(tool.name))) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * 登録の確認。registerTool の戻り値は await するが、完了保証にはしない。
 * 直後に getTools() を読んで、実際に入ったかを確かめる。
 */
export async function confirmRegistered(
  context: ModelContext,
  names: string[],
): Promise<{ ok: boolean; missing: string[] }> {
  const registered = new Set((await context.getTools()).map((tool) => tool.name));
  const missing = names.filter((name) => !registered.has(name));
  return { ok: missing.length === 0, missing };
}

/** テストと /lab の表示用。いまどの呼び方で通っているか */
export function currentExecuteStyle(): ExecuteStyle | null {
  return executeStyle;
}

/** テスト用。覚えた呼び方を忘れる */
export function resetExecuteStyle(): void {
  executeStyle = null;
}
