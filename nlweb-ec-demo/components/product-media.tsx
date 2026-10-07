import { PALETTES, figureFor } from "../core/product-svg.ts";
import type { Product } from "../core/types.ts";

/**
 * 商品の画像の代わりに出す図柄。
 * 架空の商品なので写真は持たない。実在の商品の写真を借りると、読者が本物の店と
 * 取り違えるおそれもある。配色と図形の種は core/product-svg.ts にあり、
 * JSON-LD の image(/products/<id>/image.svg)と同じ絵になる。
 */
export function ProductMedia({
  product,
  className = "",
  priority = false,
}: {
  product: Product;
  className?: string;
  /** 詳細ページの大きい表示 */
  priority?: boolean;
}) {
  const palette = PALETTES[product.category];
  const { cx, cy, r, rotate } = figureFor(product.id);
  const gradientId = `pm-${product.id}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${product.name} のイメージ(架空の商品のため図柄で表示)`}
      className={`aspect-square w-full ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gradientId})`} />
      <circle cx={cx} cy={cy} r={r} fill={palette.mark} opacity="0.08" />
      <circle cx={100 - cx} cy={100 - cy * 0.6} r={r * 0.5} fill={palette.mark} opacity="0.06" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={palette.mark}
        opacity={priority ? 0.22 : 0.28}
        fontSize={priority ? 46 : 40}
        fontWeight="700"
        transform={`rotate(${rotate} 50 50)`}
      >
        {palette.glyph}
      </text>
    </svg>
  );
}
