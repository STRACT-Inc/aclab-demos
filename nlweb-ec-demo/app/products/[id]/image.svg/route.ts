import { findProduct } from "../../../../core/data.ts";
import { productSvg } from "../../../../core/product-svg.ts";

/**
 * JSON-LD の image が指す商品画像。画面の図柄と同じ SVG を返す。
 * Google の Merchant listing は image を必須にしているので、架空の商品でも URL を持つ。
 */
const ONE_DAY_SECONDS = 60 * 60 * 24;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const product = findProduct(id);
  if (!product) return new Response("not found", { status: 404 });
  return new Response(productSvg(product), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": `public, max-age=${ONE_DAY_SECONDS}`,
    },
  });
}
