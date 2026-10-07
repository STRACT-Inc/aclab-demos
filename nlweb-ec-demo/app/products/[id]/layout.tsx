import { findProduct, findReviews } from "../../../core/data.ts";
import { jsonLdScript, productJsonLd } from "../../../core/jsonld.ts";
import { demoOrigin } from "../../../core/origin.ts";

/**
 * 商品ページに Product の JSON-LD を出す。
 * ページ本体は client component なので、server component の layout で埋める。
 * NLWeb のクローラはこの script 要素だけを読む(microdata は見ない)。
 */
export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = findProduct(id);
  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(productJsonLd(product, findReviews(id), demoOrigin())),
          }}
        />
      )}
      {children}
    </>
  );
}
