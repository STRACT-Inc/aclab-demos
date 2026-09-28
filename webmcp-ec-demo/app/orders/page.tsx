"use client";

import Link from "next/link";
import { memberOrders } from "../../core/data.ts";
import { formatDate, formatJpy } from "../../core/format.ts";
import { useDemoState } from "../../state/use-store.ts";

const STATUS: Record<string, { label: string; tone: string }> = {
  shipped: { label: "配送中", tone: "bg-accent-soft text-accent-ink" },
  delivered: { label: "配達済み", tone: "bg-line/60 text-ink" },
  canceled: { label: "キャンセル", tone: "bg-line/60 text-muted" },
  placed: { label: "受付済み", tone: "bg-accent text-white" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS[status] ?? STATUS.placed!;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${style.tone}`}>
      {style.label}
    </span>
  );
}

/** 注文履歴。デモ会員としてログインしているときだけ見られる */
export default function OrdersPage() {
  const state = useDemoState();

  if (!state.loggedIn) {
    return (
      <div className="card mx-auto max-w-[520px] px-6 py-14 text-center">
        <p className="text-[17px] font-bold">注文履歴はデモ会員のみ表示します</p>
        <p className="mt-2 text-[13.5px] text-muted">
          登録は要りません。ボタン 1 つでログインできます。
        </p>
        <Link href="/account" className="btn btn-primary mt-6">
          ログインする
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[760px]">
      <h1 className="text-[24px] font-bold">注文履歴</h1>

      {state.orders.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[15px] font-bold">このブラウザで確定した注文</h2>
          <ul className="mt-3 space-y-3">
            {state.orders.map((order) => (
              <li key={order.order_id} className="card flex flex-wrap items-center gap-3 p-4">
                <StatusBadge status={order.status} />
                <span className="tnum text-[13.5px] font-bold">{order.order_id}</span>
                <span className="tnum text-[12.5px] text-muted">{formatDate(order.placed_at)}</span>
                <span className="tnum ml-auto text-[15px] font-bold">
                  {formatJpy(order.total_jpy)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[15px] font-bold">デモ会員の注文(架空)</h2>
        <ul className="mt-3 space-y-3">
          {memberOrders.map((order) => (
            <li key={order.order_id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={order.status} />
                <span className="tnum text-[13.5px] font-bold">{order.order_id}</span>
                <span className="tnum text-[12.5px] text-muted">{formatDate(order.placed_at)}</span>
                <span className="tnum ml-auto text-[15px] font-bold">
                  {formatJpy(order.total_jpy)}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-muted">{order.items.join("、")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
