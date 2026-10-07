import type { Category, Product } from "./types.ts";

/**
 * 商品の図柄の元データ。
 * 架空の商品なので写真は持たず、カテゴリごとの配色と一文字で商品ごとに違う絵にする。
 * 画面(components/product-media.tsx)と JSON-LD の image(/products/<id>/image.svg)を
 * 同じ絵にするため、配色と図形の種はここに置く。
 */
export interface Palette {
  from: string;
  to: string;
  glyph: string;
  mark: string;
}

export const PALETTES: Record<Category, Palette> = {
  tea: { from: "#e8f1ea", to: "#cfe3d6", glyph: "茶", mark: "#1f6e4e" },
  wagashi: { from: "#f6ece6", to: "#ecd8cc", glyph: "菓", mark: "#9c5638" },
  kitchen: { from: "#eceef2", to: "#d8dee8", glyph: "器", mark: "#3f5570" },
  apparel: { from: "#f0eef4", to: "#ddd8e8", glyph: "衣", mark: "#5b4d78" },
};

/** 商品 ID から図柄の変化を決める(同じ商品はいつも同じ絵になる) */
export function seed(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

export interface Figure {
  cx: number;
  cy: number;
  r: number;
  rotate: number;
}

export function figureFor(productId: string): Figure {
  const s = seed(productId);
  return {
    cx: 30 + (s % 40),
    cy: 26 + ((s >> 3) % 30),
    r: 26 + ((s >> 6) % 14),
    rotate: -8 + ((s >> 9) % 16),
  };
}

/** 画像として配る大きさ(px)。Google の商品画像は 1 辺 50px 以上を求める */
export const IMAGE_SIZE = 600;

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

/** 単体の SVG 文書。route handler が image/svg+xml で返す */
export function productSvg(product: Product): string {
  const palette = PALETTES[product.category];
  const f = figureFor(product.id);
  const gradientId = `pm-${product.id}`;
  const label = escapeXml(`${product.name} のイメージ(架空の商品のため図柄で表示)`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" role="img" aria-label="${label}">`,
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${palette.from}"/><stop offset="100%" stop-color="${palette.to}"/>`,
    `</linearGradient></defs>`,
    `<rect width="100" height="100" fill="url(#${gradientId})"/>`,
    `<circle cx="${f.cx}" cy="${f.cy}" r="${f.r}" fill="${palette.mark}" opacity="0.08"/>`,
    `<circle cx="${100 - f.cx}" cy="${100 - f.cy * 0.6}" r="${f.r * 0.5}" fill="${palette.mark}" opacity="0.06"/>`,
    `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="${palette.mark}" opacity="0.22" font-size="46" font-weight="700" font-family="sans-serif" transform="rotate(${f.rotate} 50 50)">${palette.glyph}</text>`,
    `</svg>`,
  ].join("");
}
