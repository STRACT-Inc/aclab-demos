import * as cartCore from "../core/cart.ts";
import { STORAGE_KEYS } from "./keys.ts";
import { createOrder, normalizeAddress, type AddressInput } from "../core/checkout.ts";
import { isError, type DomainError } from "../core/errors.ts";
import {
  EMPTY_CART,
  type Address,
  type Cart,
  type PaymentMethod,
  type PlacedOrder,
} from "../core/types.ts";

/**
 * ブラウザ内の状態。
 * React の外(WebMCP のツール)からも同じ関数で読み書きするので、React に依存しない
 * 小さなストアにして、画面は useSyncExternalStore で購読する。
 */

export { STORAGE_KEYS } from "./keys.ts";

export interface LabSettings {
  /** hint を無視する(記事の A/B の対照条件) */
  hintIgnored: boolean;
  descriptionLang: "ja" | "en";
  /** consequential なツールの前に確認ボタンを出す */
  harnessConfirm: boolean;
}

export interface DemoState {
  cart: Cart;
  orders: PlacedOrder[];
  loggedIn: boolean;
  address: Address | null;
  payment: PaymentMethod | null;
  /** このタブで表示・返却した商品 ID(出所ゲート用) */
  seen: string[];
  lab: LabSettings;
}

const initialState: DemoState = {
  cart: EMPTY_CART,
  orders: [],
  loggedIn: false,
  address: null,
  payment: null,
  seen: [],
  lab: { hintIgnored: false, descriptionLang: "ja", harnessConfirm: false },
};

let state: DemoState = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

const browser = (): boolean => typeof window !== "undefined";

function read<T>(storage: Storage | undefined, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    // 壊れた値や、保存が使えないブラウザ設定では初期値に戻す
    return fallback;
  }
}

function write(storage: Storage | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できない設定でもデモは動かす */
  }
}

/** 最初に読まれたときだけブラウザの保存から読み込む */
function hydrate(): void {
  if (hydrated || !browser()) return;
  hydrated = true;
  const local = window.localStorage;
  const session = window.sessionStorage;
  const checkout = read<{ address: Address | null; payment: PaymentMethod | null }>(
    session,
    STORAGE_KEYS.checkout,
    { address: null, payment: null },
  );
  state = {
    cart: read<Cart>(local, STORAGE_KEYS.cart, EMPTY_CART),
    orders: read<PlacedOrder[]>(local, STORAGE_KEYS.orders, []),
    loggedIn: read<{ logged_in: boolean }>(local, STORAGE_KEYS.session, { logged_in: false })
      .logged_in,
    address: checkout.address,
    payment: checkout.payment,
    seen: read<string[]>(session, STORAGE_KEYS.seen, []),
    lab: read<LabSettings>(local, STORAGE_KEYS.lab, initialState.lab),
  };
}

function persist(): void {
  if (!browser()) return;
  const local = window.localStorage;
  const session = window.sessionStorage;
  write(local, STORAGE_KEYS.cart, state.cart);
  write(local, STORAGE_KEYS.orders, state.orders);
  write(local, STORAGE_KEYS.session, { logged_in: state.loggedIn });
  write(local, STORAGE_KEYS.lab, state.lab);
  write(session, STORAGE_KEYS.seen, state.seen);
  write(session, STORAGE_KEYS.checkout, { address: state.address, payment: state.payment });
}

function set(next: Partial<DemoState>): void {
  state = { ...state, ...next };
  persist();
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): DemoState {
  hydrate();
  return state;
}

/** SSR ではブラウザの保存を読めないので、初期値を返して hydration のあとに差し替える */
export function getServerState(): DemoState {
  return initialState;
}

export interface Ok<T> {
  ok: true;
  value: T;
}

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const actions = {
  /** 表示・返却した商品を出所ゲートの一覧に足す */
  markSeen(productIds: string[]): void {
    const merged = new Set([...getState().seen, ...productIds]);
    set({ seen: [...merged] });
  },

  hasSeen(productId: string): boolean {
    return getState().seen.includes(productId);
  },

  addToCart(input: cartCore.AddToCartInput): Ok<Cart> | DomainError {
    const next = cartCore.addToCart(getState().cart, input);
    if (isError(next)) return next;
    set({ cart: next });
    return ok(next);
  },

  setCartQuantity(input: { line_id: string; quantity: number }): Ok<Cart> | DomainError {
    const next = cartCore.setCartQuantity(getState().cart, input);
    if (isError(next)) return next;
    set({ cart: next });
    return ok(next);
  },

  applyCoupon(code: string): Ok<Cart> | DomainError {
    const next = cartCore.applyCoupon(getState().cart, code);
    if (isError(next)) return next;
    set({ cart: next });
    return ok(next);
  },

  saveAddress(input: AddressInput): Ok<Address> | DomainError {
    const address = normalizeAddress(input);
    if (isError(address)) return address;
    set({ address });
    return ok(address);
  },

  selectPayment(method: PaymentMethod): Ok<PaymentMethod> {
    set({ payment: method });
    return ok(method);
  },

  /** 注文の確定。確定ボタンのハンドラだけが呼ぶ(ツールからは呼ばない) */
  placeOrder(): Ok<PlacedOrder> | DomainError {
    const order = createOrder(getState().cart);
    if (isError(order)) return order;
    set({ orders: [order, ...getState().orders], cart: EMPTY_CART });
    return ok(order);
  },

  setLoggedIn(loggedIn: boolean): void {
    set({ loggedIn });
  },

  setLab(lab: Partial<LabSettings>): void {
    set({ lab: { ...getState().lab, ...lab } });
  },

  /** リセット。ブラウザに置いたものをすべて消す */
  resetAll(): void {
    if (browser()) {
      for (const key of Object.values(STORAGE_KEYS)) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      }
    }
    state = initialState;
    for (const listener of listeners) listener();
  },
};
