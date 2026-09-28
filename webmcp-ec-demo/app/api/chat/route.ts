import { createChatHandler, lazyHandler } from "@aclab/demo-guard";
import { getConfig, getModel, getStore, SYSTEM_PROMPT } from "../deps.ts";

export const runtime = "nodejs";

/** POST /api/chat — モデルを 1 回呼んで SSE で返す。ツールの実行はページ側 */
export const POST = lazyHandler(() =>
  createChatHandler({
    store: getStore(),
    config: getConfig(),
    model: getModel(),
    systemPrompt: SYSTEM_PROMPT,
  }),
);
