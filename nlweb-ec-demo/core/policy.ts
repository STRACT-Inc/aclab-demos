import { findPolicy, memberOrders } from "./data.ts";
import { err } from "./errors.ts";
import type { PolicyTopic } from "./types.ts";

/** 規約と注文履歴(get_store_policy / get_order_status) */

export function getPolicy(topic: string) {
  const policy = findPolicy(topic as PolicyTopic);
  if (!policy) {
    return err("invalid_input", `規約 ${topic} は見つかりません`, {
      hint: "topic は shipping / returns / payment のどれかです",
    });
  }
  return { topic: policy.topic, text: policy.text };
}

export const ORDER_TIMEFRAMES = ["last_week", "last_month", "all"] as const;
export type OrderTimeframe = (typeof ORDER_TIMEFRAMES)[number];

/** デモ会員の注文履歴。ログインしているときだけ呼ばれる */
export function getOrderStatus(input: { order_id?: string; timeframe?: OrderTimeframe } = {}) {
  const orders = input.order_id
    ? memberOrders.filter((order) => order.order_id === input.order_id)
    : memberOrders;
  return {
    orders: orders.map((order) => ({
      order_id: order.order_id,
      status: order.status,
      placed_at: order.placed_at,
      total_jpy: order.total_jpy,
      items: order.items,
    })),
  };
}
