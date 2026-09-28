"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductMedia } from "../../../components/product-media.tsx";
import { Stars } from "../../../components/stars.tsx";
import { FREE_SHIPPING_OVER_JPY, SHIPPING_FEE_JPY } from "../../../core/cart.ts";
import { findProduct, findReviews } from "../../../core/data.ts";
import { isError } from "../../../core/errors.ts";
import { formatJpy } from "../../../core/format.ts";
import { CATEGORY_LABELS } from "../../../core/types.ts";
import { actions } from "../../../state/store.ts";
import { setCurrentProduct } from "../../../webmcp/tools.ts";

/** 商品ページ。表示した商品は出所ゲートの一覧に足す */
export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const product = findProduct(params.id);
  const reviews = findReviews(params.id);
  const [variantId, setVariantId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 表示した商品を出所ゲートに足し、ツールから「この商品」として引けるようにする
  useEffect(() => {
    if (!product) return;
    actions.markSeen([product.id]);
    setCurrentProduct(product.id);
    return () => setCurrentProduct(null);
  }, [product]);

  if (!product) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-[15px] font-bold">この商品は見つかりません</p>
        <Link href="/" className="btn btn-outline mt-5">
          商品一覧へ
        </Link>
      </div>
    );
  }

  const average =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) /
        10
      : product.rating;

  const add = (thenCheckout: boolean) => {
    const result = actions.addToCart({
      product_id: product.id,
      ...(variantId ? { variant_id: variantId } : {}),
      quantity,
    });
    if (isError(result)) {
      setMessage({ ok: false, text: result.error.message });
      return;
    }
    setMessage({ ok: true, text: "カートに入れました" });
    if (thenCheckout) router.push("/cart");
  };

  return (
    <>
      <nav className="text-[12.5px] text-muted">
        <Link href="/" className="hover:text-accent-ink">
          ホーム
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/search?category=${product.category}`} className="hover:text-accent-ink">
          {CATEGORY_LABELS[product.category]}
        </Link>
        <span className="mx-1.5">/</span>
        <span>{product.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="card mx-auto w-full max-w-[520px] overflow-hidden lg:sticky lg:top-40 lg:self-start">
          <ProductMedia product={product} priority />
        </div>

        <div>
          <p className="text-[12px] text-muted">{CATEGORY_LABELS[product.category]}</p>
          <h1 className="mt-1 text-[24px] font-bold leading-[1.5]">{product.name}</h1>
          <div className="mt-2">
            <Stars rating={average} count={reviews.length} />
          </div>
          <p className="tnum mt-4 text-[28px] font-bold">{formatJpy(product.price_jpy)}</p>
          <p className="mt-1 text-[12.5px] text-muted">税込 / 送料は注文手続きで計算します</p>

          <div className="card mt-5 space-y-4 p-5">
            {product.variants.length > 0 && (
              <div>
                <p className="text-[13px] font-bold">サイズ・色</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={!variant.in_stock}
                      onClick={() => setVariantId(variant.id)}
                      data-variant-id={variant.id}
                      className={`chip ${variant.in_stock ? "" : "line-through opacity-45"}`}
                      data-active={variantId === variant.id}
                    >
                      {variant.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label htmlFor="quantity" className="text-[13px] font-bold">
                個数
              </label>
              <select
                id="quantity"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="field w-24"
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span
                className={`ml-auto text-[12.5px] font-bold ${
                  product.in_stock ? "text-accent-ink" : "text-sale"
                }`}
              >
                {product.in_stock ? "在庫あり" : "在庫切れ"}
              </span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => add(false)}
                disabled={!product.in_stock}
                className="btn btn-primary w-full"
              >
                カートに入れる
              </button>
              <button
                type="button"
                onClick={() => add(true)}
                disabled={!product.in_stock}
                className="btn btn-outline w-full"
              >
                すぐに購入手続きへ
              </button>
            </div>

            {message && (
              <p
                role="status"
                className={`text-[13px] font-bold ${message.ok ? "text-accent-ink" : "text-sale"}`}
              >
                {message.text}
              </p>
            )}

            <p className="border-t border-line pt-3 text-[12.5px] leading-[1.9] text-muted">
              {formatJpy(FREE_SHIPPING_OVER_JPY)} 以上で送料無料(通常{" "}
              {formatJpy(SHIPPING_FEE_JPY)})/ 2〜3 営業日で発送 / 到着後 14 日以内は返品可
            </p>
          </div>

          <p className="mt-5 text-[14px] leading-[2.0]">{product.summary}</p>
        </div>
      </div>

      <section className="mt-12 max-w-[760px]">
        <h2 className="text-[19px] font-bold">レビュー</h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-muted">まだレビューはありません。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((review, index) => (
              <li key={index} className="card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars rating={review.rating} />
                  <p className="text-[14px] font-bold">{review.title}</p>
                </div>
                <p className="mt-2 text-[13.5px] leading-[1.95]">{review.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
