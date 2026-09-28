import {
  anthropicModelClient,
  loadConfig,
  memoryStore,
  storeFromEnv,
  unavailableStore,
  type GuardConfig,
  type ModelClient,
  type Store,
} from "@aclab/demo-guard";

/**
 * API の組み立て。route.ts はここで作ったハンドラを呼ぶだけにする。
 * 設定とストアはリクエストが来るまで作らない(ビルド時に環境変数を読まないため)。
 * 話題ごとのデモは SYSTEM_PROMPT とツールのカタログを差し替える。
 */

let config: GuardConfig | null = null;
let store: Store | null = null;
let model: ModelClient | null = null;

export function getConfig(): GuardConfig {
  return (config ??= loadConfig());
}

export function getStore(): Store {
  if (store) return store;
  const fromEnv = storeFromEnv();
  // 本番で接続情報が無いときは、上限を数えられないままモデルを呼ばない
  store = fromEnv ?? (process.env.NODE_ENV === "production" ? unavailableStore() : memoryStore());
  return store;
}

export function getModel(): ModelClient {
  return (model ??= anthropicModelClient());
}

/** システムプロンプト。BYO キーの直接呼び出しと同じ文字列を使う */
export { SYSTEM_PROMPT } from "../../system-prompt.ts";

/** 統計で受け付けるツール名。13 本のカタログにある名前だけ通す */
export { TOOL_NAMES } from "../../webmcp/tools.ts";
/** 統計で受け付けるシナリオ ID */
export { SCENARIO_IDS } from "../../scenarios.ts";
