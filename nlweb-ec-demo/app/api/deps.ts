import {
  loadConfig,
  memoryStore,
  storeFromEnv,
  unavailableStore,
  type GuardConfig,
  type Store,
} from "@aclab/demo-guard";
import { upstreamFromEnv, type NlwebUpstream } from "./nlweb.ts";

/**
 * API の組み立て。route.ts はここで作ったハンドラを呼ぶだけにする。
 * 設定とストアはリクエストが来るまで作らない(ビルド時に環境変数を読まないため)。
 * このデモのチャットは NLWeb の /ask だけを呼ぶので、Anthropic のクライアントは持たない。
 */

let config: GuardConfig | null = null;
let store: Store | null = null;
let upstream: NlwebUpstream | null = null;

export function getConfig(): GuardConfig {
  return (config ??= loadConfig());
}

export function getStore(): Store {
  if (store) return store;
  const fromEnv = storeFromEnv();
  // 本番で接続情報が無いときは、上限を数えられないまま NLWeb を呼ばない
  store = fromEnv ?? (process.env.NODE_ENV === "production" ? unavailableStore() : memoryStore());
  return store;
}

export function getUpstream(): NlwebUpstream {
  return (upstream ??= upstreamFromEnv());
}

/** 会話検索のキルスイッチ。未設定は有効 */
export function askEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ASK_ENABLED !== "false" && env.ASK_ENABLED !== "0";
}

/** /mcp の ask に site を補うか。補わない条件と比べるときだけ false にする */
export function mcpSiteInject(env: Record<string, string | undefined> = process.env): boolean {
  return env.MCP_SITE_INJECT !== "false" && env.MCP_SITE_INJECT !== "0";
}

/** 統計で受け付けるツール名(テンプレート互換。このデモにはツールが無い) */
export const TOOL_NAMES: string[] = [];
/** 統計で受け付けるシナリオ ID */
export const SCENARIO_IDS: string[] = [];
