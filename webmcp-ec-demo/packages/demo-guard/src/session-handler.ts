import { z } from "zod";
import type { GuardConfig } from "./config.ts";
import { errorResponse, jsonResponse } from "./http.ts";
import { clientIp, ipHash } from "./ip.ts";
import { checkSessionIssueRate } from "./limits.ts";
import { consoleLogger, type Logger } from "./log.ts";
import { issueChatSession } from "./session.ts";
import type { Store } from "./store.ts";

/** `POST /api/session`。チャットのセッションを発行する */

export const sessionRequestSchema = z
  .object({
    mode: z.enum(["native", "polyfill", "none"]).optional(),
    browser: z
      .object({ brand: z.string().max(32), major: z.number().int().min(0).max(1_000) })
      .strict()
      .optional(),
  })
  .strict();

export interface SessionDeps {
  store: Store;
  config: GuardConfig;
  logger?: Logger;
}

export function createSessionHandler(deps: SessionDeps) {
  const { store, config } = deps;
  const log = deps.logger ?? consoleLogger;

  return async function handleSession(req: Request): Promise<Response> {
    if (!config.chatEnabled) {
      return errorResponse("chat_disabled", "チャットは一時的に止めています", 503);
    }

    const parsed = sessionRequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse("invalid_request", "リクエストの形が合いません", 400);
    }

    const hashed = ipHash(clientIp(req), config.ipHashSecret);
    try {
      const rate = await checkSessionIssueRate(store, config, hashed);
      if (!rate.ok) {
        return errorResponse("rate_limited", "しばらく時間をおいてください", 429);
      }
      const issued = await issueChatSession(store, config);
      log("session_issued", {
        mode: parsed.data.mode ?? "unknown",
        brand: parsed.data.browser?.brand ?? "unknown",
        major: parsed.data.browser?.major ?? 0,
      });
      return jsonResponse({
        chat_session_id: issued.chatSessionId,
        budget: { turns: issued.budget.turns, expires_at: issued.expiresAt },
      });
    } catch {
      // ストアに届かないときはセッションを出さない(数えられないまま Anthropic を呼ばせない)
      log("session_blocked", { reason: "store_unavailable" });
      return errorResponse("store_unavailable", "一時的に利用できません", 503);
    }
  };
}
