import type { NextConfig } from "next";

/**
 * Next.js 16 の proxy.ts(旧 middleware)は使わない。API は app/api 配下の route.ts だけ。
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@aclab/demo-guard"],
};

export default nextConfig;
