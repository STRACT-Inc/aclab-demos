#!/usr/bin/env node
/**
 * 1 つのティアで get_cart を続けて呼び、何回目でレート制限にかかるかを見る。
 *
 *   pnpm rate --tier anonymous|signed|token [--max 30] [--interval-ms 0]
 *
 * 最初に制限がかかった時点で止める。自分の開発用ストアに対してだけ実行すること。
 */
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { TIERS, loadConfig, missingFor } from "../lib/config.mjs";
import { callTool } from "../lib/mcp.mjs";
import { toRow, writeResults } from "../lib/record.mjs";

// 上限の探索が相手への負荷にならないよう、回数に天井を置く
const HARD_MAX = 200;

const { values } = parseArgs({
  options: {
    tier: { type: "string" },
    max: { type: "string", default: "30" },
    "interval-ms": { type: "string", default: "0" },
  },
});
if (!TIERS.includes(values.tier)) {
  console.error(`--tier must be one of: ${TIERS.join(", ")}`);
  process.exit(2);
}
const tier = values.tier;
const max = Math.min(Number(values.max), HARD_MAX);
const intervalMs = Number(values["interval-ms"]);

const config = loadConfig();
const missing = missingFor(tier, config);
if (missing.length > 0) {
  console.error(`set ${missing.join(", ")} to run the ${tier} tier`);
  process.exit(1);
}

const isThrottled = (o) => o.httpStatus === 429 || Boolean(o.rateHeaders["retry-after"]);

const observations = [];
const cart = await callTool({
  config,
  tier,
  name: "create_cart",
  args: {
    cart: {
      line_items: [{ quantity: 1, item: { id: config.variantId } }],
      context: { address_country: config.addressCountry },
    },
  },
});
observations.push(cart);

let throttledAt = null;
if (cart.id) {
  for (let i = 1; i <= max; i++) {
    const o = await callTool({ config, tier, name: "get_cart", args: { id: cart.id } });
    observations.push({ ...o, attempt: i });
    if (isThrottled(o)) {
      throttledAt = i;
      break;
    }
    if (intervalMs > 0) await sleep(intervalMs);
  }
  // 制限中は後片付けも拒否されうる。失敗しても結果は残す
  observations.push(await callTool({ config, tier, name: "cancel_cart", args: { id: cart.id } }));
}

console.table(observations.slice(-5).map(toRow));
console.log(
  throttledAt
    ? `${tier}: throttled at attempt ${throttledAt}`
    : `${tier}: no throttle within ${observations.filter((o) => o.attempt).length} get_cart calls`,
);
console.log(`saved ${writeResults(`rate-${tier}`, observations, config)}`);
