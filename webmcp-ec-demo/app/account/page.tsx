"use client";

import Link from "next/link";
import { countItems } from "../../core/cart.ts";
import { actions } from "../../state/store.ts";
import { useDemoState } from "../../state/use-store.ts";

/**
 * ログインの切り替え。WebMCP のデモでは、ログイン後に /orders へ移ると
 * get_order_status が登録される様子を見せる。
 */
export default function AccountPage() {
  const state = useDemoState();

  return (
    <div className="mx-auto max-w-[560px]">
      <h1 className="text-[24px] font-bold">{state.loggedIn ? "マイページ" : "ログイン"}</h1>

      <div className="card mt-5 p-6">
        {state.loggedIn ? (
          <>
            <p className="text-[15px] font-bold">デモ会員としてログイン中です</p>
            <dl className="mt-4 space-y-2 text-[13.5px]">
              <div className="flex justify-between">
                <dt className="text-muted">カート</dt>
                <dd className="tnum">{countItems(state.cart)} 点</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">このブラウザの注文</dt>
                <dd className="tnum">{state.orders.length} 件</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/orders" className="btn btn-primary">
                注文履歴を見る
              </Link>
              <button
                type="button"
                onClick={() => actions.setLoggedIn(false)}
                className="btn btn-outline"
              >
                ログアウト
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">デモ会員は架空の利用者です</p>
            <p className="mt-2 text-[13.5px] leading-[1.9] text-muted">
              メールアドレスもパスワードも要りません。ボタンを押すと、このブラウザの中だけで
              ログイン状態になります。注文履歴が見られるようになります。
            </p>
            <button
              type="button"
              onClick={() => actions.setLoggedIn(true)}
              className="btn btn-primary mt-6 w-full"
            >
              デモ会員としてログイン
            </button>
          </>
        )}
      </div>
    </div>
  );
}
