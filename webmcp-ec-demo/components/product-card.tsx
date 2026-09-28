import Link from "next/link";
import { formatJpy } from "../core/format.ts";
import { CATEGORY_LABELS, type Product } from "../core/types.ts";
import { ProductMedia } from "./product-media.tsx";
import { Stars } from "./stars.tsx";

/** 一覧のカード */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="product-card"
      data-product-id={product.id}
      aria-label={product.name}
    >
      <div className="relative">
        <ProductMedia product={product} />
        {!product.in_stock && (
          <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-bold text-white">
            在庫切れ
          </span>
        )}
        {product.variants.length > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-bold">
            サイズ・色あり
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11.5px] text-muted">{CATEGORY_LABELS[product.category]}</p>
        <p className="mt-1 line-clamp-2 text-[14.5px] font-bold leading-[1.55]">{product.name}</p>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.8] text-muted">
          {product.summary}
        </p>
        <div className="mt-3 flex items-end justify-between gap-2 pt-1">
          <p className="tnum text-[17px] font-bold">{formatJpy(product.price_jpy)}</p>
          <Stars rating={product.rating} className="pb-0.5" />
        </div>
      </div>
    </Link>
  );
}
