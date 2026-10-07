import { countItems, totals } from "./cart.ts";
import { err, type DomainError } from "./errors.ts";
import type { Address, Cart, PaymentMethod, PlacedOrder } from "./types.ts";
import { PAYMENT_METHODS } from "./types.ts";

/** チェックアウト(宣言形フォームと place_order が同じ関数を通る) */

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

/** 全角の数字・ハイフン・空白を半角に直す(フォームにも音声入力にも効く) */
export function toHalfWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―ー－]/g, "-")
    .replace(/[　]/g, " ")
    .trim();
}

const digitsOnly = (text: string): string => toHalfWidth(text).replace(/[^0-9]/g, "");

export interface AddressInput {
  postal_code?: string;
  prefecture?: string;
  city?: string;
  address_line?: string;
  last_name?: string;
  first_name?: string;
  phone?: string;
}

/**
 * 住所を正規化して検証する。郵便番号は 123-4567、電話はハイフンなしの数字に直す。
 * 足りない項目や形の違うものは、どの項目かを details に入れて返す。
 */
export function normalizeAddress(input: AddressInput): Address | DomainError {
  const invalid: string[] = [];

  const postal = digitsOnly(input.postal_code ?? "");
  if (postal.length !== 7) invalid.push("postal_code");

  const prefecture = toHalfWidth(input.prefecture ?? "");
  if (!PREFECTURES.includes(prefecture as (typeof PREFECTURES)[number])) {
    invalid.push("prefecture");
  }

  const city = (input.city ?? "").trim();
  if (city.length === 0) invalid.push("city");

  const addressLine = (input.address_line ?? "").trim();
  if (addressLine.length === 0) invalid.push("address_line");

  const lastName = (input.last_name ?? "").trim();
  if (lastName.length === 0) invalid.push("last_name");

  const firstName = (input.first_name ?? "").trim();
  if (firstName.length === 0) invalid.push("first_name");

  const phone = digitsOnly(input.phone ?? "");
  if (phone.length > 0 && (phone.length < 10 || phone.length > 11)) invalid.push("phone");

  if (invalid.length > 0) {
    return err("address_invalid", `配送先の ${invalid.join("、")} を確認してください`, {
      hint: "日本国内の住所で、郵便番号は 7 桁、電話は 10〜11 桁で入力してください",
      details: { invalid_fields: invalid },
    });
  }

  return {
    postal_code: `${postal.slice(0, 3)}-${postal.slice(3)}`,
    prefecture,
    city,
    address_line: addressLine,
    last_name: lastName,
    first_name: firstName,
    phone,
  };
}

export function isAddressValid(address: Address | null | undefined): address is Address {
  if (!address) return false;
  const checked = normalizeAddress(address);
  return !("error" in checked);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.includes(value as PaymentMethod);
}

/** 注文の確認シートに出す内容(place_order の戻り値) */
export function previewOrder(cart: Cart) {
  const { total_jpy } = totals(cart);
  return { items_count: countItems(cart), total_jpy };
}

/** 注文の確定。ツールからは呼ばず、確定ボタンのハンドラだけが呼ぶ */
export function createOrder(
  cart: Cart,
  options: { now?: Date; id?: string } = {},
): PlacedOrder | DomainError {
  if (cart.lines.length === 0) {
    return err("cart_empty", "カートが空です", { hint: "先に商品を追加してください" });
  }
  const now = options.now ?? new Date();
  const id = options.id ?? `ORD-${now.getTime().toString(36).toUpperCase()}`;
  return {
    order_id: id,
    placed_at: now.toISOString(),
    total_jpy: totals(cart).total_jpy,
    status: "placed",
  };
}
