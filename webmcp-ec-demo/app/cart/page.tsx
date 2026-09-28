"use client";

import Link from "next/link";
import { useState } from "react";
import { OrderSummary } from "../../components/order-summary.tsx";
import { ProductMedia } from "../../components/product-media.tsx";
import { cartView, MAX_QUANTITY_PER_LINE, totals } from "../../core/cart.ts";
import { findProduct } from "../../core/data.ts";
import { isError } from "../../core/errors.ts";
import { formatJpy } from "../../core/format.ts";
import { actions } from "../../state/store.ts";
import { useDemoState } from "../../state/use-store.ts";

export default function CartPage() {
  const state = useDemoState();
  const view = cartView(state.cart);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (view.lines.length === 0) {
    return (
      <div className="card mx-auto max-w-[520px] px-6 py-14 text-center">
        <p className="text-[17px] font-bold">カートは空です</p>
        <p className="mt-2 text-[13.5px] text-muted">気になるものをカートに入れてください。</p>
        <Link href="/" className="btn btn-primary mt-6">
          商品を見る
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[24px] font-bold">
        カート<span className="tnum ml-2 text-[14px] font-normal text-muted">{view.lines.length} 種類</span>
      </h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {view.lines.map((line) => {
            const product = findProduct(line.product_id);
            return (
              <div key={line.line_id} className="card flex gap-4 p-4">
                <Link href={`/products/${line.product_id}`} className="w-20 shrink-0 sm:w-24">
                  {product && (
                    <ProductMedia product={product} className="rounded-[10px] overflow-hidden" />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/products/${line.product_id}`} className="text-[14.5px] font-bold">
                    {line.name}
                  </Link>
                  {line.variant_label && (
                    <p className="mt-0.5 text-[12.5px] text-muted">{line.variant_label}</p>
                  )}
                  <p className="tnum mt-1 text-[13px] text-muted">
                    単価 {formatJpy(line.price_jpy)}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
                    <label className="flex items-center gap-2 text-[12.5px]">
                      <span className="text-muted">個数</span>
                      <select
                        value={line.quantity}
                        aria-label={`${line.name} の個数`}
                        onChange={(event) =>
                          actions.setCartQuantity({
                            line_id: line.line_id,
                            quantity: Number(event.target.value),
                          })
                        }
                        className="field w-20 py-1.5"
                      >
                        {Array.from({ length: MAX_QUANTITY_PER_LINE }, (_, i) => i + 1).map(
                          (value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        actions.setCartQuantity({ line_id: line.line_id, quantity: 0 })
                      }
                      className="text-[12.5px] text-muted underline underline-offset-2 hover:text-sale"
                    >
                      削除
                    </button>
                    <p className="tnum ml-auto text-[15px] font-bold">
                      {formatJpy(line.price_jpy * line.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          <form
            className="card flex flex-wrap items-center gap-2 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const result = actions.applyCoupon(code);
              setMessage(
                isError(result)
                  ? { ok: false, text: result.error.message }
                  : { ok: true, text: `${code.trim().toUpperCase()} を適用しました` },
              );
            }}
          >
            <label htmlFor="coupon" className="text-[13px] font-bold">
              クーポン
            </label>
            <input
              id="coupon"
              name="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="WELCOME10"
              className="field w-40 flex-none"
            />
            <button type="submit" className="btn btn-outline py-2.5">
              適用する
            </button>
            {message && (
              <span
                role="status"
                className={`text-[12.5px] font-bold ${
                  message.ok ? "text-accent-ink" : "text-sale"
                }`}
              >
                {message.text}
              </span>
            )}
          </form>
        </div>

        <div className="lg:sticky lg:top-40 lg:self-start">
          <OrderSummary totals={totals(state.cart)} coupon={view.coupon}>
            <Link href="/checkout" className="btn btn-primary w-full">
              レジへ進む
            </Link>
            <Link
              href="/"
              className="mt-3 block text-center text-[13px] text-muted hover:text-accent-ink"
            >
              買い物を続ける
            </Link>
          </OrderSummary>
        </div>
      </div>
    </>
  );
}
