import scenariosJson from "./scenarios.json" with { type: "json" };
import { z } from "zod";
import { PAYMENT_METHODS } from "./core/types.ts";

/**
 * 記事の検証シナリオ。チャットのチップ・deep link・計測ハーネス・
 * 統計の受け付け ID が、この 1 ファイルを読む。
 * setup は「前提」の列で、deep link を開いたときにブラウザ内の状態をここまで作る。
 */

const setupSchema = z
  .object({
    cart: z
      .array(
        z
          .object({
            product_id: z.string(),
            variant_id: z.string().optional(),
            quantity: z.number().int().min(1),
          })
          .strict(),
      )
      .max(8),
    logged_in: z.boolean(),
    /** "dummy" は架空の配送先(DUMMY_ADDRESS)を入れる。null は未入力のまま */
    address: z.literal("dummy").nullable(),
    payment: z.enum(PAYMENT_METHODS).nullable(),
  })
  .strict();

const scenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** チップに出す短い名前 */
    label: z.string().min(1).max(20),
    /** 前提を作る場所。deep link がここに揃える */
    path: z.string().regex(/^\/[a-z0-9\-/]*$/),
    prompt: z.string().min(1).max(200),
    setup: setupSchema,
    /** 期待するツール列(計測ハーネスの判定に使う) */
    expected_tools: z.array(z.string()).min(1),
    /** 合格条件。人が読む文 */
    pass: z.string().min(1),
  })
  .strict();

export type ScenarioSetup = z.infer<typeof setupSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

export const SCENARIOS: Scenario[] = z.array(scenarioSchema).parse(scenariosJson);

export const SCENARIO_IDS: string[] = SCENARIOS.map((scenario) => scenario.id);

export function findScenario(id: string | null | undefined): Scenario | undefined {
  return id ? SCENARIOS.find((scenario) => scenario.id === id) : undefined;
}

export interface ScenarioLink {
  scenario: Scenario;
  openChat: boolean;
  fromArticle: boolean;
}

/** deep link の読み取り(`?scenario=<id>&open=chat&from=article`)。知らない id は無視する */
export function parseScenarioLink(search: string): ScenarioLink | null {
  const params = new URLSearchParams(search);
  const scenario = findScenario(params.get("scenario"));
  if (!scenario) return null;
  return {
    scenario,
    openChat: params.get("open") === "chat",
    fromArticle: params.get("from") === "article",
  };
}

/** deep link の組み立て。記事のリンクとチップの遷移が同じ形を通る */
export function scenarioHref(scenario: Scenario, from?: "article"): string {
  const params = new URLSearchParams({ scenario: scenario.id, open: "chat" });
  if (from) params.set("from", from);
  return `${scenario.path}?${params.toString()}`;
}
