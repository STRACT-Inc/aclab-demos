import { consoleLogger, lazyHandler } from "@aclab/demo-guard";
import { getConfig, getStore, getUpstream, mcpSiteInject } from "../api/deps.ts";
import { createMcpHandler } from "../api/mcp-handler.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = lazyHandler(() =>
  createMcpHandler({
    store: getStore(),
    config: getConfig(),
    upstream: getUpstream(),
    log: consoleLogger,
    injectSite: mcpSiteInject(),
  }),
);

/** MCP の Streamable HTTP では GET は SSE の購読だが、参照実装は使わない。405 で断る */
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
