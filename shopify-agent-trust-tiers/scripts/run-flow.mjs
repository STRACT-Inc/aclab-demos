#!/usr/bin/env node
/**
 * 同じ買い物の流れ(カート作成 → checkout 作成 → 後片付け)を、名乗り方だけ変えて実行する。
 *
 *   pnpm flow [--tier anonymous|signed|token|all] [--probe-complete]
 *
 * --probe-complete を付けると、支払い情報なしで complete_checkout を呼び、ティアごとの拒否のされ方を見る。
 * 注文は成立しない想定だが、必ず自分の開発用ストアに対して実行すること。
 */
import { parseArgs } from "node:util";
import { TIERS, loadConfig, missingFor } from "../lib/config.mjs";
import { callTool } from "../lib/mcp.mjs";
import { toRow, writeResults } from "../lib/record.mjs";
import { decodeJwtPayload, fetchAccessToken } from "../lib/tiers.mjs";

const { values } = parseArgs({
  options: { tier: { type: "string", default: "all" }, "probe-complete": { type: "boolean", default: false } },
});
const tiers = values.tier === "all" ? TIERS : [values.tier];
if (!tiers.every((t) => TIERS.includes(t))) {
  console.error(`--tier must be one of: ${TIERS.join(", ")}, all`);
  process.exit(2);
}

const config = loadConfig();

async function runTier(tier) {
  const observations = [];
  const skip = (tool, reason) => observations.push({ tier, tool, skipped: reason });
  const call = async (name, args) => {
    const observation = await callTool({ config, tier, name, args });
    observations.push(observation);
    return observation;
  };

  const missing = missingFor(tier, config);
  if (missing.length > 0) {
    skip("(all)", `set ${missing.join(", ")}`);
    return observations;
  }

  if (tier === "token") {
    // トークンそのものは記録しない。スコープと上限の申告だけを残す
    const payload = decodeJwtPayload(await fetchAccessToken(config)) ?? {};
    observations.push({ tier, tool: "(access token)", scopes: payload.scopes, limits: payload.limits, exp: payload.exp });
  }

  const lineItems = [{ quantity: 1, item: { id: config.variantId } }];
  const cart = await call("create_cart", {
    cart: { line_items: lineItems, context: { address_country: config.addressCountry } },
  });
  if (!cart.id) {
    for (const tool of ["get_cart", "create_checkout", "get_checkout"]) skip(tool, "no cart id");
    return observations;
  }
  await call("get_cart", { id: cart.id });

  // cart_id は checkout の中に置き、line_items も一緒に渡す(2026-10-07 の実測で通った形)。
  // チュートリアルの「最上位に置く」は "Missing required arguments: checkout"、
  // cart_id だけを checkout に置くのは "missing required properties: line_items" で弾かれた
  const checkout = await call("create_checkout", { checkout: { cart_id: cart.id, line_items: lineItems } });
  if (checkout.id) {
    await call("get_checkout", { id: checkout.id });
    if (values["probe-complete"]) await call("complete_checkout", { id: checkout.id, checkout: {} });
    await call("cancel_checkout", { id: checkout.id });
    // checkout に変換した cart は消える(cancel_cart が cart_not_found になる)ので取り消さない
  } else {
    skip("get_checkout", "no checkout id");
    await call("cancel_cart", { id: cart.id });
  }
  return observations;
}

const all = [];
for (const tier of tiers) {
  try {
    all.push(...(await runTier(tier)));
  } catch (error) {
    all.push({ tier, tool: "(error)", skipped: error.message });
  }
}

console.table(all.filter((o) => o.tool !== "(access token)").map(toRow));
console.log(`saved ${writeResults("flow", all, config)}`);
