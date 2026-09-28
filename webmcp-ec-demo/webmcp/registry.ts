import Ajv, { type ValidateFunction } from "ajv";
import { err, isError, type DomainError } from "../core/errors.ts";
import { untilUnregistered } from "./compat.ts";
import { modelContext } from "./detect.ts";
import type { ToolAnnotations, WebMcpToolDefinition } from "./types.ts";

/**
 * ツールの登録。
 * scope ごとに AbortController を 1 つ持ち、unmount で abort する。abort すると
 * toolchange が飛び、ページ内エージェントの一覧が更新される。
 */

export type ToolScope = "global" | "cart" | "checkout" | "orders";

/**
 * パスからページ固有の scope を決める。
 * 画面側(use-webmcp)とヘッドレスの計測(scripts/measure-models.ts)が同じ表を使う。
 */
export function scopeForPath(pathname: string): ToolScope | null {
  if (pathname.startsWith("/cart")) return "cart";
  if (pathname.startsWith("/checkout")) return "checkout";
  if (pathname.startsWith("/orders")) return "orders";
  return null;
}

/** name の形。30 字以内 */
const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,30}$/;
const DESCRIPTION_MAX = 500;
const PARAM_DESCRIPTION_MAX = 150;

export interface LabTool {
  name: string;
  /** 出すページ。複数書ける(クーポンは cart と checkout の両方にある) */
  scope: ToolScope | ToolScope[];
  description: { ja: string; en: string };
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  /** 戻り値は object。JSON 文字列への変換はこの層が行う */
  execute: (args: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
  /** 条件付き登録(例: place_order はカート非空かつ住所有効) */
  when?: () => boolean;
}

const ajv = new Ajv({ allErrors: true, coerceTypes: false, strict: false });
const validators = new Map<string, ValidateFunction>();
const tools: LabTool[] = [];

/** 登録時に形を検査する。破れば開発中に例外で気づける */
export function defineTool(tool: LabTool): LabTool {
  if (!NAME_PATTERN.test(tool.name)) {
    throw new Error(`ツール名が規則に合いません: ${tool.name}`);
  }
  for (const [lang, text] of Object.entries(tool.description)) {
    if (text.length > DESCRIPTION_MAX) {
      throw new Error(`${tool.name} の説明(${lang})が ${DESCRIPTION_MAX} 字を超えています`);
    }
  }
  const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
  for (const [key, property] of Object.entries(properties)) {
    if ((property.description?.length ?? 0) > PARAM_DESCRIPTION_MAX) {
      throw new Error(`${tool.name}.${key} の説明が ${PARAM_DESCRIPTION_MAX} 字を超えています`);
    }
  }

  validators.set(tool.name, ajv.compile(tool.inputSchema));
  tools.push(tool);
  return tool;
}

/**
 * 入力の再検証。
 * Chrome が inputSchema どおりの入力を保証しないので、モデルに渡したのと同じ schema で
 * もう一度検証する。違反はエラーの戻り値にして、モデルが直せるようにする。
 */
export function validate(
  name: string,
  raw: unknown,
): Record<string, unknown> | DomainError {
  const validator = validators.get(name);
  if (!validator) return err("invalid_input", `${name} は登録されていません`);

  const args = (raw ?? {}) as Record<string, unknown>;
  if (validator(args)) return args;

  const first = validator.errors?.[0];
  const path = first?.instancePath || "(入力全体)";
  return err("invalid_input", `${path} ${first?.message ?? "が schema に合いません"}`, {
    hint: "inputSchema に合わせて呼び直してください",
    details: { path, keyword: first?.keyword },
  });
}

/** ラボのツールが返す JSON 文字列の上限 */
const OUTPUT_MAX_CHARS = 1_500;

/** 出力を上限まで切り詰める。切ったら truncated を立てる */
export function clampOutput(value: unknown): string {
  const text = JSON.stringify(value);
  if (text.length <= OUTPUT_MAX_CHARS) return text;
  return JSON.stringify({
    truncated: true,
    note: `結果が長いため ${OUTPUT_MAX_CHARS} 字で切りました`,
    head: text.slice(0, OUTPUT_MAX_CHARS),
  });
}

/** ラボのチャット以外からの呼び出しを数えるためのフラグ */
let internalCall = false;
let externalCalls = 0;

export function markInternalCall<T>(run: () => Promise<T>): Promise<T> {
  internalCall = true;
  return run().finally(() => {
    internalCall = false;
  });
}

export function externalCallCount(): number {
  return externalCalls;
}

export interface MountOptions {
  /** 説明の言語(/lab で切り替える) */
  lang: "ja" | "en";
}

const controllers = new Map<ToolScope, AbortController>();
let options: MountOptions = { lang: "ja" };

/** ツールの一覧(/lab の表示とテスト用) */
export function allTools(): readonly LabTool[] {
  return tools;
}

/**
 * ページ側のカタログにある annotations。
 * Chrome 152 の getTools() は readOnlyHint と untrustedContentHint は返すが、
 * consequentialHint を返さない(実測)。落ちたぶんをここから補う。
 */
export function annotationsFor(name: string): ToolAnnotations | undefined {
  return tools.find((tool) => tool.name === name)?.annotations;
}

/** ツールを出す scope の一覧(1 個でも配列でも同じ形にする) */
const scopesOf = (tool: LabTool): ToolScope[] =>
  Array.isArray(tool.scope) ? tool.scope : [tool.scope];

/** いま登録されているべきツール(scope と when で決まる) */
export function activeTools(scopes: ToolScope[]): LabTool[] {
  return tools.filter(
    (tool) =>
      scopesOf(tool).some((scope) => scopes.includes(scope)) &&
      (tool.when === undefined || tool.when()),
  );
}

function toDefinition(tool: LabTool): WebMcpToolDefinition {
  return {
    name: tool.name,
    description: tool.description[options.lang],
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    async execute(input, executeOptions) {
      if (!internalCall) externalCalls += 1;
      const args = validate(tool.name, input);
      const result = isError(args) ? args : await tool.execute(args, executeOptions);
      // 仕様は MCP の content ブロック。ページ側では object を扱い、ここで文字列にする
      return { content: [{ type: "text", text: clampOutput(result) }] };
    },
  };
}

/** scope ごとの登録を直列にする(入れ直しが重なると重複登録になる) */
const queues = new Map<ToolScope, Promise<void>>();

/** いま登録しているツール名(登録解除を待つのに使う) */
const registeredNames = new Map<ToolScope, string[]>();

/**
 * scope のツールを登録する。すでに登録済みなら入れ直す。
 * abort() の登録解除は非同期なので、消えるのを待ってから入れる。待たずに入れると
 * Chrome 152 は InvalidStateError「Duplicate tool name」を投げる(実測)。
 */
export function mount(scope: ToolScope): Promise<void> {
  const queued = (queues.get(scope) ?? Promise.resolve()).then(() => mountNow(scope));
  // 失敗しても次の入れ直しは行う
  queues.set(
    scope,
    queued.catch(() => {}),
  );
  return queued;
}

async function mountNow(scope: ToolScope): Promise<void> {
  const context = modelContext();
  if (!context) return;

  const previous = registeredNames.get(scope) ?? [];
  unmount(scope);
  if (previous.length > 0) await untilUnregistered(context, previous);

  const controller = new AbortController();
  controllers.set(scope, controller);

  const target = tools.filter(
    (tool) => scopesOf(tool).includes(scope) && (tool.when === undefined || tool.when()),
  );
  const done: string[] = [];

  for (const tool of target) {
    try {
      await context.registerTool(toDefinition(tool), { signal: controller.signal });
      done.push(tool.name);
    } catch (error) {
      const name = (error as Error | null)?.name;
      // 入れ直しの途中で古い登録が abort されたときは無視してよい
      if (name === "AbortError") continue;
      // 前の登録がまだ消えていないときは、消えるのを待って 1 度だけやり直す
      if (name === "InvalidStateError") {
        await untilUnregistered(context, [tool.name]);
        try {
          await context.registerTool(toDefinition(tool), { signal: controller.signal });
          done.push(tool.name);
        } catch {
          // 2 度目も失敗したらこのツールは諦める(ほかのツールは登録する)
        }
        continue;
      }
      throw error;
    }
    if (controller.signal.aborted) break;
  }

  registeredNames.set(scope, done);
}

/** scope のツールを外す。abort で toolchange が飛ぶ(解除は非同期) */
export function unmount(scope: ToolScope): void {
  controllers.get(scope)?.abort();
  controllers.delete(scope);
}

/** settled() が待ち直す上限。入れ直しが連鎖しても止まるようにする */
const SETTLE_ROUNDS = 5;

/**
 * 登録の待ち行列が空になるまで待つ。
 * 前提を作った直後にツール一覧を引くと、入れ直しの途中で条件付きのツールが欠ける。
 * シナリオの自動投入で place_order が 1 本足りない状態でモデルに渡っていた(実機で確認)。
 */
export async function settled(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    const before = [...queues.values()];
    if (before.length === 0) return;
    await Promise.all(before);
    const after = [...queues.values()];
    // 待っている間に新しい入れ直しが積まれていなければ終わり
    if (after.length === before.length && after.every((queue, i) => queue === before[i])) return;
  }
}

/** 移動先の scope が登録されるまで待つ上限と、見に行く間隔 */
const SCOPE_MOUNT_TIMEOUT_MS = 1_000;
const SCOPE_MOUNT_POLL_MS = 25;

/**
 * ページを移ったあと、移動先の scope が登録し終わるまで待つ。
 * 登録はルートの変化を見た React の effect が積むので、遷移を起こした直後には
 * まだ積まれていない。待たずにツール一覧を引くと、移動先のツールが欠けたまま
 * モデルに渡る(実機で apply_coupon が 1 本落ちた)。
 * WebMCP が無い環境(ヘッドレスの計測など)では待たない。
 */
export async function untilScopeMounted(pathname: string): Promise<void> {
  const scope = scopeForPath(pathname);
  if (!scope || !modelContext()) return;
  const deadline = Date.now() + SCOPE_MOUNT_TIMEOUT_MS;
  for (;;) {
    await settled();
    if (controllers.has(scope)) return;
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, SCOPE_MOUNT_POLL_MS));
  }
}

/** 条件(when)や説明の言語が変わったときに入れ直す */
export function remount(scope: ToolScope): Promise<void> {
  return mount(scope);
}

/** いま登録できているツール名(/lab とテスト用) */
export function registeredToolNames(scope: ToolScope): readonly string[] {
  return registeredNames.get(scope) ?? [];
}

export function setMountOptions(next: Partial<MountOptions>): void {
  options = { ...options, ...next };
}

export function mountOptions(): MountOptions {
  return options;
}

/** テスト用。登録の状態を戻す */
export function resetRegistry(): void {
  for (const scope of [...controllers.keys()]) unmount(scope);
  registeredNames.clear();
  queues.clear();
  externalCalls = 0;
  internalCall = false;
}
