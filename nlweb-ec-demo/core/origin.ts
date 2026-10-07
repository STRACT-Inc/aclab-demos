/**
 * デモのオリジン。
 * JSON-LD の url と image、サイトマップの URL は絶対 URL でなければならない。
 * 本番は正規のサブドメイン、プレビューは Vercel の URL、手元は 3300 番。
 */
export const PUBLIC_DEMO_ORIGIN = "https://nlweb.demo.agentic-commerce-lab.jp";
export const LOCAL_DEMO_ORIGIN = "http://localhost:3300";

export function demoOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.NEXT_PUBLIC_DEMO_ORIGIN) return env.NEXT_PUBLIC_DEMO_ORIGIN.replace(/\/$/, "");
  if (env.VERCEL_ENV === "production") return PUBLIC_DEMO_ORIGIN;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return LOCAL_DEMO_ORIGIN;
}
