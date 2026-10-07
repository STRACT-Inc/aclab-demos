import { createTelemetryHandler, lazyHandler } from "@aclab/demo-guard";
import { getConfig, getStore, SCENARIO_IDS, TOOL_NAMES } from "../deps.ts";

export const runtime = "nodejs";

/**
 * POST /api/telemetry — セッション要約の受け口。
 * TELEMETRY_ENABLED=false の間は 404 を返し、何も保存しない。
 */
export const POST = lazyHandler(() =>
  createTelemetryHandler({
    store: getStore(),
    config: getConfig(),
    catalog: { toolNames: TOOL_NAMES, scenarioIds: SCENARIO_IDS },
  }),
);
