import { FREE_SHIPPING_OVER_JPY } from "../core/cart.ts";
import { formatJpy } from "../core/format.ts";
import type { CartTotals } from "../core/types.ts";

/** カートとレジで共通の金額欄。送料無料までの残りも出す */
export function OrderSummary({
  totals,
  coupon,
  children,
}: {
  totals: CartTotals;
  coupon?: string;
  /** レジへ進むボタンなど */
  children?: React.ReactNode;
}) {
  const payable = totals.subtotal_jpy - totals.discount_jpy;
  const remaining = Math.max(FREE_SHIPPING_OVER_JPY - payable, 0);
  const progress = Math.min((payable / FREE_SHIPPING_OVER_JPY) * 100, 100);

  return (
    <div className="card p-5">
      <h2 className="text-[15px] font-bold">お支払い金額</h2>

      <dl className="mt-4 space-y-2 text-[13.5px]">
        <div className="flex justify-between">
          <dt className="text-muted">小計</dt>
          <dd className="tnum">{formatJpy(totals.subtotal_jpy)}</dd>
        </div>
        {totals.discount_jpy > 0 && (
          <div className="flex justify-between text-accent-ink">
            <dt>割引{coupon ? `(${coupon})` : ""}</dt>
            <dd className="tnum">-{formatJpy(totals.discount_jpy)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">送料</dt>
          <dd className="tnum">
            {totals.shipping_jpy === 0 ? "無料" : formatJpy(totals.shipping_jpy)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-[17px] font-bold">
          <dt>合計</dt>
          <dd className="tnum">{formatJpy(totals.total_jpy)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-[12.5px] text-muted">
          {remaining > 0
            ? `あと ${formatJpy(remaining)} で送料無料`
            : "送料無料の対象です"}
        </p>
        <div className="meter mt-1.5" role="presentation">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
