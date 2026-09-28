import type { Category, Product } from "../core/types.ts";

/**
 * 商品の画像の代わりに出す図柄。
 * 架空の商品なので写真は持たない。実在の商品の写真を借りると、読者が本物の店と
 * 取り違えるおそれもある。カテゴリごとの配色と一文字で、商品ごとに違う絵にする。
 */

interface Palette {
  from: string;
  to: string;
  glyph: string;
  mark: string;
}

const PALETTES: Record<Category, Palette> = {
  tea: { from: "#e8f1ea", to: "#cfe3d6", glyph: "茶", mark: "#1f6e4e" },
  wagashi: { from: "#f6ece6", to: "#ecd8cc", glyph: "菓", mark: "#9c5638" },
  kitchen: { from: "#eceef2", to: "#d8dee8", glyph: "器", mark: "#3f5570" },
  apparel: { from: "#f0eef4", to: "#ddd8e8", glyph: "衣", mark: "#5b4d78" },
};

/** 商品 ID から図柄の変化を決める(同じ商品はいつも同じ絵になる) */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

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
  const seed = hash(product.id);
  const cx = 30 + (seed % 40);
  const cy = 26 + ((seed >> 3) % 30);
  const r = 26 + ((seed >> 6) % 14);
  const rotate = -8 + ((seed >> 9) % 16);
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
