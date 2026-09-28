"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrderSummary } from "../../components/order-summary.tsx";
import { ShippingForm } from "../../components/shipping-form.tsx";
import { ProductMedia } from "../../components/product-media.tsx";
import { cartView, totals } from "../../core/cart.ts";
import { previewOrder } from "../../core/checkout.ts";
import { findProduct } from "../../core/data.ts";
import { isError } from "../../core/errors.ts";
import { formatJpy } from "../../core/format.ts";
import { PAYMENT_LABELS, PAYMENT_METHODS, type PaymentMethod } from "../../core/types.ts";
import { actions } from "../../state/store.ts";
import { setConfirmSheetOpener } from "../../webmcp/tools.ts";
import { useDemoState } from "../../state/use-store.ts";

/**
 * チェックアウト。注文は確定ボタンでしか作られない。
 * WebMCP のデモでは、このフォームに toolname / toolparamdescription を足し、
 * place_order が確認シートを開くだけにする。
 */

const PAYMENT_NOTES: Record<PaymentMethod, string> = {
  credit_card: "注文時に与信、発送時に請求",
  convenience_store: "入金の確認後に発送",
  cod: "手数料 330 円",
  bank_transfer: "入金の確認後に発送",
};

function Step({ index, title, done }: { index: number; title: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`tnum flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
          done ? "bg-accent text-white" : "border border-line text-muted"
        }`}
      >
        {done ? "✓" : index}
      </span>
      <span className={`text-[13px] ${done ? "font-bold" : "text-muted"}`}>{title}</span>
    </li>
  );
}

export default function CheckoutPage() {
  const state = useDemoState();
  const view = cartView(state.cart);
  const [addressMessage, setAddressMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);

  // place_order は確認シートを開くだけ。確定は人が押す
  useEffect(() => {
    setConfirmSheetOpener(() => setSheetOpen(true));
    return () => setConfirmSheetOpener(null);
  }, []);

  const preview = previewOrder(state.cart);
  const ready = state.address !== null && state.payment !== null && state.cart.lines.length > 0;

  if (placed) {
    return (
      <div className="card mx-auto max-w-[560px] px-6 py-14 text-center">
        <p className="text-[13px] font-bold tracking-[0.14em] text-accent">THANK YOU</p>
        <h1 className="mt-3 text-[22px] font-bold">ご注文を受け付けました(架空)</h1>
        <p className="tnum mt-3 text-[14px]">注文番号 {placed}</p>
        <p className="mt-3 text-[13px] leading-[1.9] text-muted">
          このデモでは実際の決済も配送もありません。注文の記録はお使いのブラウザの中だけに残ります。
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link href="/orders" className="btn btn-primary">
            注文履歴を見る
          </Link>
          <Link href="/" className="btn btn-outline">
            買い物を続ける
          </Link>
        </div>
      </div>
    );
  }

  if (state.cart.lines.length === 0) {
    return (
      <div className="card mx-auto max-w-[520px] px-6 py-14 text-center">
        <p className="text-[17px] font-bold">カートが空です</p>
        <Link href="/" className="btn btn-primary mt-6">
          商品を見る
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[24px] font-bold">ご注文手続き</h1>
      <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Step index={1} title="配送先" done={state.address !== null} />
        <Step index={2} title="支払い方法" done={state.payment !== null} />
        <Step index={3} title="内容の確認" done={false} />
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ShippingForm address={state.address} onSaved={setAddressMessage} />
          {addressMessage && (
            <p
              role="status"
              className={`text-[12.5px] font-bold ${
                addressMessage.ok ? "text-accent-ink" : "text-sale"
              }`}
            >
              {addressMessage.text}
            </p>
          )}

          <section className="card p-5">
            <h2 className="text-[16px] font-bold">2. 支払い方法</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PAYMENT_METHODS.map((method) => (
                <label
                  key={method}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 transition-colors ${
                    state.payment === method
                      ? "border-accent bg-accent-soft"
                      : "border-line hover:border-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={method}
                    checked={state.payment === method}
                    onChange={() => actions.selectPayment(method as PaymentMethod)}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="block text-[13.5px] font-bold">{PAYMENT_LABELS[method]}</span>
                    <span className="block text-[12px] text-muted">{PAYMENT_NOTES[method]}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-[16px] font-bold">3. 注文内容</h2>
            <ul className="mt-3 divide-y divide-line">
              {view.lines.map((line) => {
                const product = findProduct(line.product_id);
                return (
                  <li key={line.line_id} className="flex items-center gap-3 py-3">
                    {product && (
                      <div className="w-12 shrink-0">
                        <ProductMedia
                          product={product}
                          className="overflow-hidden rounded-[8px]"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold">{line.name}</p>
                      {line.variant_label && (
                        <p className="text-[12px] text-muted">{line.variant_label}</p>
                      )}
                    </div>
                    <p className="tnum text-[12.5px] text-muted">×{line.quantity}</p>
                    <p className="tnum text-[13.5px] font-bold">
                      {formatJpy(line.price_jpy * line.quantity)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={!ready}
              className="btn btn-primary mt-5 w-full"
            >
              注文内容を確認する
            </button>
            {!ready && (
              <p className="mt-2 text-center text-[12.5px] text-muted">
                配送先の保存と支払い方法の選択が要ります。
              </p>
            )}
          </section>

          {sheetOpen && (
            <section
              aria-label="注文の確認"
              data-confirm-sheet
              className="card border-accent p-5"
            >
              <h2 className="text-[16px] font-bold">注文の確認</h2>
              <p className="tnum mt-2 text-[14px]">
                {preview.items_count} 点 / 合計 {formatJpy(preview.total_jpy)}
              </p>
              {state.address && (
                <p className="mt-1.5 text-[13px] leading-[1.9] text-muted">
                  {state.address.postal_code} {state.address.prefecture}
                  {state.address.city}
                  {state.address.address_line} / {state.address.last_name}
                  {state.address.first_name} 様
                  {state.payment ? ` / ${PAYMENT_LABELS[state.payment]}` : ""}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const result = actions.placeOrder();
                    if (!isError(result)) setPlaced(result.value.order_id);
                  }}
                  className="btn btn-primary"
                >
                  注文を確定する
                </button>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="btn btn-outline"
                >
                  戻る
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="lg:sticky lg:top-40 lg:self-start">
          <OrderSummary totals={totals(state.cart)} coupon={view.coupon} />
        </div>
      </div>
    </>
  );
}
