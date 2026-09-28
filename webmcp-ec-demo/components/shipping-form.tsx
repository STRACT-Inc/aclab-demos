"use client";

import { useEffect, useRef, useState } from "react";
import { ADDRESS_FORM_DESCRIPTION, isAddressValid, PREFECTURES } from "../core/checkout.ts";
import { isError } from "../core/errors.ts";
import { actions } from "../state/store.ts";
import type { Address } from "../core/types.ts";

/**
 * 宣言形の配送先フォーム。
 * toolname / tooldescription を付けると、Chrome がこのフォームから schema を合成して
 * ツールとして公開する。toolautosubmit は付けない。入力はエージェント、保存は人が押す。
 *
 * 説明文は core/checkout.ts の ADDRESS_FORM_DESCRIPTION にある。保存済みかどうかで
 * 言うことを変える(理由はそちらのコメント)。
 */

/** エージェントが触った箇所を見せる(実験的な擬似クラスなので style に直接書く) */
const TOOL_ACTIVE_CSS = `
form:where(:tool-form-active) {
  outline: 2px solid var(--color-accent);
  outline-offset: 6px;
  border-radius: 14px;
}
button:where(:tool-submit-active) {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
`;

export function ShippingForm({
  address,
  onSaved,
}: {
  address: Address | null;
  onSaved: (message: { ok: boolean; text: string }) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const saved = isAddressValid(address);

  // エージェントが入力した・取り消したことを読者に見せる
  useEffect(() => {
    const show = (text: string) => {
      setToast(text);
      setTimeout(() => setToast(null), 4_000);
    };
    const onActivated = (event: Event) => {
      const name = (event as CustomEvent & { toolName?: string }).toolName ?? "フォーム";
      show(`エージェントが ${name} を入力しました。内容を確かめて保存してください`);
    };
    const onCancel = (event: Event) => {
      const name = (event as CustomEvent & { toolName?: string }).toolName ?? "フォーム";
      show(`${name} の入力が取り消されました`);
    };
    window.addEventListener("toolactivated", onActivated);
    window.addEventListener("toolcancel", onCancel);
    return () => {
      window.removeEventListener("toolactivated", onActivated);
      window.removeEventListener("toolcancel", onCancel);
    };
  }, []);

  return (
    <>
      <style>{TOOL_ACTIVE_CSS}</style>
      <form
        ref={formRef}
        id="shipping"
        className="card p-5"
        // 説明が変わったら登録し直させる(属性の変更だけでは入れ替わらない)。
        // 保存済みの住所が差し替わったときも入れ直して、表示を state に合わせる
        key={saved ? `saved:${address?.postal_code ?? ""}` : "new"}
        toolname="shipping_address_form"
        tooldescription={saved ? ADDRESS_FORM_DESCRIPTION.saved : ADDRESS_FORM_DESCRIPTION.empty}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const result = actions.saveAddress({
            postal_code: String(form.get("postal_code") ?? ""),
            prefecture: String(form.get("prefecture") ?? ""),
            city: String(form.get("city") ?? ""),
            address_line: String(form.get("address_line") ?? ""),
            last_name: String(form.get("last_name") ?? ""),
            first_name: String(form.get("first_name") ?? ""),
            phone: String(form.get("phone") ?? ""),
          });
          const message = isError(result)
            ? { ok: false, text: result.error.message }
            : { ok: true, text: "配送先を保存しました" };
          onSaved(message);

          // エージェントが送信したときだけ結果を返す。
          // agentInvoked が false のまま respondWith を呼ぶと InvalidStateError になる。
          // 人が保存を押したときは false なので、ここは通らない(Chrome 152 で実測)
          const submit = event.nativeEvent as SubmitEvent;
          if (submit.agentInvoked && submit.respondWith) {
            submit.respondWith(
              Promise.resolve(
                isError(result)
                  ? result
                  : { ok: true, address: result.value, note: "保存済み。注文はまだ確定していません" },
              ),
            );
          }
        }}
      >
        <h2 className="text-[16px] font-bold">1. 配送先</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {saved
            ? "保存済みです。変更するときだけ書き換えて、もう一度保存してください。"
            : "架空のストアです。実在の住所や氏名は入力しないでください。"}
        </p>

        {toast && (
          <p role="status" className="mt-3 rounded-[10px] bg-accent-soft px-3 py-2 text-[12.5px] font-bold text-accent-ink">
            {toast}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px]">
            <span className="font-bold">郵便番号</span>
            <input
              name="postal_code"
              defaultValue={address?.postal_code ?? ""}
              inputMode="numeric"
              // 全角で入れる読者もエージェントもここで弾かない(整形は core/checkout.ts)
              pattern="[0-9０-９]{3}[-ー−‐―–—]?[0-9０-９]{4}"
              placeholder="231-0005"
              required
              toolparamdescription="7 桁。ハイフンあり・なしどちらも可(例: 231-0005)"
              className="field mt-1.5"
            />
          </label>
          <label className="text-[13px]">
            <span className="font-bold">都道府県</span>
            <select
              name="prefecture"
              defaultValue={address?.prefecture ?? ""}
              required
              toolparamdescription="都道府県名(例: 神奈川県)"
              className="field mt-1.5"
            >
              <option value="">選んでください</option>
              {PREFECTURES.map((prefecture) => (
                <option key={prefecture} value={prefecture}>
                  {prefecture}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px]">
            <span className="font-bold">市区町村</span>
            <input
              name="city"
              defaultValue={address?.city ?? ""}
              placeholder="横浜市中区"
              required
              toolparamdescription="市区町村(例: 横浜市中区)"
              className="field mt-1.5"
            />
          </label>
          <label className="text-[13px]">
            <span className="font-bold">番地・建物名</span>
            <input
              name="address_line"
              defaultValue={address?.address_line ?? ""}
              placeholder="本町 1-2-3"
              required
              toolparamdescription="番地と建物名(例: 本町 1-2-3)"
              className="field mt-1.5"
            />
          </label>
          <label className="text-[13px]">
            <span className="font-bold">姓</span>
            <input
              name="last_name"
              defaultValue={address?.last_name ?? ""}
              required
              toolparamdescription="姓(例: 山田)"
              className="field mt-1.5"
            />
          </label>
          <label className="text-[13px]">
            <span className="font-bold">名</span>
            <input
              name="first_name"
              defaultValue={address?.first_name ?? ""}
              required
              toolparamdescription="名(例: 太郎)"
              className="field mt-1.5"
            />
          </label>
          <label className="text-[13px] sm:col-span-2">
            <span className="font-bold">電話番号</span>
            <input
              name="phone"
              defaultValue={address?.phone ?? ""}
              inputMode="tel"
              placeholder="09000000000"
              toolparamdescription="ハイフンなしの半角数字(例: 09000000000)"
              className="field mt-1.5"
            />
          </label>
        </div>

        <button type="submit" className="btn btn-outline mt-4">
          配送先を保存
        </button>
      </form>
    </>
  );
}
