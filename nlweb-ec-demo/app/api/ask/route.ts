import { consoleLogger, lazyHandler } from "@aclab/demo-guard";
import { askEnabled, getConfig, getStore, getUpstream } from "../deps.ts";
import { createAskHandler } from "../ask-handler.ts";

export const runtime = "nodejs";
/** 1 質問で NLWeb が数十回 LLM を呼ぶので、既定の 10 秒では足りない */
export const maxDuration = 60;

export const POST = lazyHandler(() =>
  createAskHandler({
    store: getStore(),
    config: getConfig(),
    upstream: getUpstream(),
    log: consoleLogger,
    enabled: askEnabled,
  }),
);
