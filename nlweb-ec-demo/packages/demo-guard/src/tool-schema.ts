import { z } from "zod";

/**
 * ページから渡された JSON Schema を Anthropic の input_schema に合わせて整える。
 * 宣言形フォームから Chrome が合成する schema は anyOf + const + enum の形になるため、
 * そのまま渡すとモデルが読みにくい。
 */

/** description の上限。超えたぶんは切る */
const DESCRIPTION_MAX_CHARS = 150;
/** 入れ子の深さの上限(壊れた schema で無限に潜らないため) */
const MAX_DEPTH = 8;

/** Anthropic に渡さないキーワード */
const DROPPED_KEYS = new Set(["$schema", "$id", "$ref", "definitions", "$defs"]);

/**
 * ツール 1 件の input_schema の上限(JSON 文字列で数える)。
 * ラボのツールは 1 件 500 字以内、Chrome が宣言形フォームから合成する schema は
 * 選択肢を含めて 3,000 字ほど(2026-09-17、results/get-tools.json)
 */
export const TOOL_SCHEMA_MAX_CHARS = 8_000;

/**
 * tools 配列全体の上限(JSON 文字列で数える)。件数の上限(40)と 1 件の上限だけだと
 * 掛け算で 30 万字を通せるので、合計でも抑える。実測は 12 件で 1 万字弱
 */
export const TOOLS_TOTAL_MAX_CHARS = 40_000;

/**
 * JSON にしたときの長さで上限を掛ける。形は問わないが、大きさだけは通さない。
 * z.unknown() のままだと、ここだけ本文の上限をすり抜けて数百 KB を通せる
 */
export const jsonUpTo = (maxChars: number, label: string) =>
  z.unknown().refine((value) => (JSON.stringify(value) ?? "").length <= maxChars, {
    message: `${label} は JSON で ${maxChars} 字までです`,
  });

/** ページが送るのは name / description / input_schema だけ。それ以外のキーは落とす */
export const toolDeclSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  description: z.string().max(1_000).optional(),
  inputSchema: jsonUpTo(TOOL_SCHEMA_MAX_CHARS, "inputSchema").optional(),
  input_schema: jsonUpTo(TOOL_SCHEMA_MAX_CHARS, "input_schema").optional(),
});

export type ToolDecl = z.infer<typeof toolDeclSchema>;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function normalizeNode(node: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((item) => normalizeNode(item, depth + 1));

  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (key === "description" && typeof value === "string") {
      out.description = truncate(value, DESCRIPTION_MAX_CHARS);
      continue;
    }
    out[key] = normalizeNode(value, depth + 1);
  }

  // anyOf: [{const, title}, ...] と enum が併存する形は enum だけ残し、title は description に畳む
  const anyOf = out.anyOf;
  if (Array.isArray(anyOf)) {
    const constants = anyOf.filter(
      (entry): entry is { const: unknown; title?: string } =>
        typeof entry === "object" && entry !== null && "const" in entry,
    );
    if (constants.length === anyOf.length && constants.length > 0) {
      out.enum = Array.isArray(out.enum) ? out.enum : constants.map((entry) => entry.const);
      const titles = constants.map((entry) => entry.title).filter((t): t is string => Boolean(t));
      if (titles.length > 0 && typeof out.description !== "string") {
        out.description = truncate(titles.join(" / "), DESCRIPTION_MAX_CHARS);
      }
      delete out.anyOf;
    }
  }
  return out;
}

/** Anthropic の tools 配列 1 件ぶん。Messages API の形に合わせる */
export interface NormalizedTool {
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
}

/**
 * ページのツール宣言を Anthropic の形に直す。
 * schema が object でないもの(壊れた宣言)は空の object schema に落とす。
 */
export function normalizeTool(decl: ToolDecl): NormalizedTool {
  const raw = decl.input_schema ?? decl.inputSchema;
  const parsed = typeof raw === "string" ? safeParseJson(raw) : raw;
  const normalized = normalizeNode(parsed, 0);
  const isObjectSchema =
    typeof normalized === "object" && normalized !== null && !Array.isArray(normalized);
  return {
    name: decl.name,
    description: truncate(decl.description ?? "", 500),
    input_schema: isObjectSchema
      ? { ...(normalized as Record<string, unknown>), type: "object" }
      : { type: "object", properties: {} },
  };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
