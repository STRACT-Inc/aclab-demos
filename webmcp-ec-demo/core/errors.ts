/**
 * ツールと画面が共有するエラー。
 * 例外は投げず、戻り値として返す。モデルが hint を読んで自分で直せる形にする。
 */

export const ERROR_CODES = [
  "invalid_input",
  "unseen_product",
  "unknown_product",
  "variant_required",
  "out_of_stock",
  "quantity_limit",
  "cart_full",
  "invalid_coupon",
  "cart_empty",
  "address_invalid",
  "not_logged_in",
  "line_not_found",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface DomainError {
  error: {
    code: ErrorCode;
    message: string;
    /** モデルが次に何をすればよいか */
    hint?: string;
    /** 判断に使える具体値(利用可能なバリアント、上限値、期限など) */
    details?: Record<string, unknown>;
  };
}

export function err(
  code: ErrorCode,
  message: string,
  extra: { hint?: string; details?: Record<string, unknown> } = {},
): DomainError {
  return { error: { code, message, ...extra } };
}

export function isError(value: unknown): value is DomainError {
  return typeof value === "object" && value !== null && "error" in value;
}
