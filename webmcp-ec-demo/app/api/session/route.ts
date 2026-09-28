import { createSessionHandler, lazyHandler } from "@aclab/demo-guard";
import { getConfig, getStore } from "../deps.ts";

export const runtime = "nodejs";

/** POST /api/session — チャットのセッションを発行する */
export const POST = lazyHandler(() =>
  createSessionHandler({ store: getStore(), config: getConfig() }),
);
