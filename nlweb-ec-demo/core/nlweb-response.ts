import { z } from "zod";

/**
 * NLWeb の応答メッセージ(SSE の各 data 行)を、画面と計測が読む形に整える。
 * 形は参照実装のコードと実測(2026-09-28)に基づく:
 *   result         content が項目の配列。@type: Summary のときは content が要約の文字列
 *   item_details   details(文字列)と name / url / score / schema_object が同じ階層にある
 *   compare_items  comparison(文字列)と item1 / item2({name, url, schema_object})
 *   ensemble_result result(推薦の入れ子)。形が揺れるのでそのまま保持する
 *   nlws           answer(文字列)と items(項目の配列)。mode=generate のとき
 *   no_results / error / intermediate_message ほか
 */

// SSE の辞書は欄が null のことがある(query_id など)。null は「無い」と同じ扱いにする
const itemSchema = z
  .object({
    url: z.string(),
    name: z.string().nullish(),
    site: z.string().nullish(),
    score: z.number().nullish(),
    description: z.string().nullish(),
    schema_object: z.unknown().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    message_type: z.string(),
    content: z.unknown().optional(),
    query_id: z.string().nullish(),
  })
  .passthrough();

export type NlwebMessage = z.infer<typeof messageSchema>;

export interface AskItem {
  url: string;
  name: string;
  site: string;
  score: number;
  description: string;
  /** schema_object.offers.price を読んだもの。読めなければ undefined */
  price_jpy?: number;
  /** schema_object.offers.availability が InStock かどうか。読めなければ undefined */
  in_stock?: boolean;
  schema_object?: unknown;
}

export type AskTool = "search" | "details" | "compare" | "ensemble" | "generate" | "none";

export interface AskResult {
  query_id?: string;
  items: AskItem[];
  /** mode=summarize の要約 */
  summary?: string;
  /** mode=generate の生成回答(nlws) */
  answer?: string;
  /** details ツールの回答 */
  details?: { name: string; url: string; text: string; score: number };
  /** compare ツールの回答 */
  comparison?: { text: string; items: { name: string; url: string }[] };
  /** ensemble ツールの回答(形が揺れるのでそのまま) */
  ensemble?: unknown;
  /** 何かしら答えが返ったか(項目・要約・回答・詳細・比較・組み合わせのいずれか) */
  answered: boolean;
  /** 応答から推定したツール */
  tool: AskTool;
  no_results: boolean;
  errors: string[];
  /** 届いた message_type の列(実測の記録用) */
  message_types: string[];
}

export function parseSchemaObject(schemaObject: unknown): unknown {
  if (typeof schemaObject !== "string") return schemaObject;
  try {
    return JSON.parse(schemaObject) as unknown;
  } catch {
    return undefined;
  }
}

function offerOf(schemaObject: unknown): Record<string, unknown> | undefined {
  if (!schemaObject || typeof schemaObject !== "object") return undefined;
  const offers = (schemaObject as Record<string, unknown>).offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  return offer && typeof offer === "object" ? (offer as Record<string, unknown>) : undefined;
}

export function priceOf(schemaObject: unknown): number | undefined {
  const price = offerOf(schemaObject)?.price;
  const value = typeof price === "string" ? Number.parseFloat(price.replace(/,/g, "")) : price;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function inStockOf(schemaObject: unknown): boolean | undefined {
  const availability = offerOf(schemaObject)?.availability;
  if (typeof availability !== "string") return undefined;
  if (/InStock$/.test(availability)) return true;
  if (/OutOfStock$|SoldOut$|Discontinued$/.test(availability)) return false;
  return undefined;
}

function toItem(raw: z.infer<typeof itemSchema>): AskItem {
  return {
    url: raw.url,
    name: raw.name ?? "",
    site: raw.site ?? "",
    score: raw.score ?? 0,
    description: raw.description ?? "",
    price_jpy: priceOf(raw.schema_object),
    in_stock: inStockOf(raw.schema_object),
    schema_object: raw.schema_object,
  };
}

function textOf(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    for (const key of ["description", "text", "answer", "summary", "message", "error"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
  }
  return undefined;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeAskMessages(input: unknown): AskResult {
  const messages = z.array(messageSchema).parse(input);
  const result: AskResult = {
    items: [],
    answered: false,
    tool: "none",
    no_results: false,
    errors: [],
    message_types: [],
  };
  const seen = new Set<string>();
  const pushItem = (raw: unknown) => {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success || seen.has(parsed.data.url)) return;
    seen.add(parsed.data.url);
    // compare_items の item1 / item2 は schema_object が JSON 文字列で届く(実測)
    result.items.push(toItem({ ...parsed.data, schema_object: parseSchemaObject(parsed.data.schema_object) }));
  };

  for (const message of messages) {
    result.message_types.push(message.message_type);
    result.query_id ??= message.query_id ?? undefined;
    const content = message.content;
    const extra = message as Record<string, unknown>;

    switch (message.message_type) {
      case "result": {
        if (Array.isArray(content)) {
          for (const entry of content) pushItem(entry);
        } else if (extra["@type"] === "Summary") {
          result.summary = textOf(content);
        }
        break;
      }
      case "item_details": {
        const text = str(extra.details);
        if (text) {
          result.details = { name: str(extra.name), url: str(extra.url), text, score: num(extra.score) };
          pushItem({ ...extra, description: text });
        }
        break;
      }
      case "compare_items": {
        const text = str(extra.comparison);
        const pair = [extra.item1, extra.item2].filter(
          (item): item is Record<string, unknown> => !!item && typeof item === "object",
        );
        if (text) {
          result.comparison = { text, items: pair.map((item) => ({ name: str(item.name), url: str(item.url) })) };
          for (const item of pair) pushItem({ ...item, description: "" });
        }
        break;
      }
      case "ensemble_result":
        if (extra.result !== undefined) result.ensemble = extra.result;
        break;
      case "nlws": {
        result.answer = str(extra.answer) || textOf(content);
        if (Array.isArray(extra.items)) for (const entry of extra.items) pushItem(entry);
        break;
      }
      case "no_results":
        result.no_results = true;
        break;
      case "error":
        result.errors.push(textOf(content) ?? textOf(extra) ?? JSON.stringify(content ?? extra));
        break;
      default:
        break;
    }
  }

  // 並びは score の降順(参照実装は届いた順で、複数の result にまたがる)
  result.items.sort((a, b) => b.score - a.score);
  result.tool = result.comparison
    ? "compare"
    : result.details
      ? "details"
      : result.ensemble !== undefined
        ? "ensemble"
        : result.answer !== undefined
          ? "generate"
          : result.items.length > 0
            ? "search"
            : "none";
  result.answered =
    result.items.length > 0 ||
    result.summary !== undefined ||
    result.answer !== undefined ||
    result.details !== undefined ||
    result.comparison !== undefined ||
    result.ensemble !== undefined;
  return result;
}
