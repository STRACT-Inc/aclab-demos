/**
 * デモ API の上限値と動作フラグ。
 * 値はここだけに置き、各モジュールは GuardConfig を受け取って使う。
 * 既定値は DEFAULTS に置き、すべて環境変数で上書きできる。
 */

/** レート制限 1 本ぶんの設定 */
export interface RateRule {
  /** 窓の中で許す回数 */
  limit: number;
  /** 窓の長さ(秒) */
  windowSeconds: number;
}

export interface GuardConfig {
  /** ストアのキーの接頭辞。デモごとに変える(例: webmcp) */
  demo: string;
  /** チャットのキルスイッチ。false でチャットの API を閉じる */
  chatEnabled: boolean;
  /** 統計の受け付け。公開時は false */
  telemetryEnabled: boolean;
  /** Anthropic のモデル。記事の再現性のため日付付きのスナップショットを既定にする */
  model: string;
  /** 1 回の応答の上限トークン */
  maxTokens: number;
  /** モデル呼び出しのタイムアウト(ミリ秒) */
  modelTimeoutMs: number;
  /** セッションの有効期間(秒)。ストアのキーの TTL がそのまま失効になる */
  sessionTtlSeconds: number;
  /** セッションあたりのユーザー発話 */
  turnsPerSession: number;
  /** 1 発話あたりのモデル呼び出し */
  modelCallsPerTurn: number;
  /** 1 発話あたりのツール呼び出し */
  toolCallsPerTurn: number;
  /** ユーザー発話の長さ(文字) */
  userMessageMaxChars: number;
  /** ツール結果の長さ(文字)。超えたぶんは切り詰める */
  toolResultMaxChars: number;
  /**
   * モデルに渡す文脈の長さ(文字)。「直近 12k トークン相当」という上限を、
   * 日本語まじりで 1 文字 ≒ 1 トークンと見て文字数で近似する
   */
  contextMaxChars: number;
  requestRate: RateRule;
  sessionIssueRate: RateRule;
  telemetryRate: RateRule;
  /** 統計の要約の最大サイズ(バイト) */
  telemetryMaxBytes: number;
  /** 要約の保持日数 */
  telemetryTtlDays: number;
  /** 全体の日次モデル呼び出し(JST の日付で区切る) */
  dailyModelCalls: number;
  /** IP ハッシュの鍵。本番では必須 */
  ipHashSecret: string;
}

/** 環境変数が無いときの値 */
const DEFAULTS = {
  demo: "demo",
  chatEnabled: true,
  telemetryEnabled: false,
  model: "claude-haiku-4-5-20251001",
  maxTokens: 600,
  modelTimeoutMs: 30_000,
  sessionTtlSeconds: 60 * 60,
  turnsPerSession: 20,
  modelCallsPerTurn: 6,
  toolCallsPerTurn: 12,
  userMessageMaxChars: 500,
  toolResultMaxChars: 2_000,
  contextMaxChars: 12_000,
  requestRate: { limit: 30, windowSeconds: 600 },
  sessionIssueRate: { limit: 3, windowSeconds: 3_600 },
  telemetryRate: { limit: 60, windowSeconds: 600 },
  telemetryMaxBytes: 4_096,
  telemetryTtlDays: 90,
  dailyModelCalls: 2_000,
} as const;

/** 開発でだけ使う IP ハッシュの鍵。本番で未設定なら loadConfig が落ちる */
const DEV_IP_HASH_SECRET = "aclab-dev-ip-hash-secret";

type Env = Record<string, string | undefined>;

function int(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} は正の整数で指定してください(受け取った値: ${raw})`);
  }
  return parsed;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} は true か false で指定してください(受け取った値: ${raw})`);
}

function rate(env: Env, prefix: string, fallback: RateRule): RateRule {
  return {
    limit: int(env, `${prefix}_LIMIT`, fallback.limit),
    windowSeconds: int(env, `${prefix}_WINDOW_SECONDS`, fallback.windowSeconds),
  };
}

/**
 * 環境変数から設定を組み立てる。
 * 本番(`NODE_ENV=production`)で `IP_HASH_SECRET` が無ければ、起動時に落として気づけるようにする。
 */
export function loadConfig(env: Env = process.env): GuardConfig {
  const isProduction = env.NODE_ENV === "production";
  const ipHashSecret = env.IP_HASH_SECRET ?? "";
  if (!ipHashSecret && isProduction) {
    throw new Error("IP_HASH_SECRET が未設定です(レート制限の IP ハッシュに必要)");
  }

  return {
    demo: env.DEMO_NAME ?? DEFAULTS.demo,
    chatEnabled: bool(env, "CHAT_ENABLED", DEFAULTS.chatEnabled),
    telemetryEnabled: bool(env, "TELEMETRY_ENABLED", DEFAULTS.telemetryEnabled),
    model: env.ANTHROPIC_MODEL ?? DEFAULTS.model,
    maxTokens: int(env, "GUARD_MAX_TOKENS", DEFAULTS.maxTokens),
    modelTimeoutMs: int(env, "GUARD_MODEL_TIMEOUT_MS", DEFAULTS.modelTimeoutMs),
    sessionTtlSeconds: int(env, "GUARD_SESSION_TTL_SECONDS", DEFAULTS.sessionTtlSeconds),
    turnsPerSession: int(env, "GUARD_TURNS_PER_SESSION", DEFAULTS.turnsPerSession),
    modelCallsPerTurn: int(env, "GUARD_MODEL_CALLS_PER_TURN", DEFAULTS.modelCallsPerTurn),
    toolCallsPerTurn: int(env, "GUARD_TOOL_CALLS_PER_TURN", DEFAULTS.toolCallsPerTurn),
    userMessageMaxChars: int(env, "GUARD_USER_MESSAGE_MAX_CHARS", DEFAULTS.userMessageMaxChars),
    toolResultMaxChars: int(env, "GUARD_TOOL_RESULT_MAX_CHARS", DEFAULTS.toolResultMaxChars),
    contextMaxChars: int(env, "GUARD_CONTEXT_MAX_CHARS", DEFAULTS.contextMaxChars),
    requestRate: rate(env, "GUARD_REQUEST_RATE", DEFAULTS.requestRate),
    sessionIssueRate: rate(env, "GUARD_SESSION_ISSUE_RATE", DEFAULTS.sessionIssueRate),
    telemetryRate: rate(env, "GUARD_TELEMETRY_RATE", DEFAULTS.telemetryRate),
    telemetryMaxBytes: int(env, "GUARD_TELEMETRY_MAX_BYTES", DEFAULTS.telemetryMaxBytes),
    telemetryTtlDays: int(env, "GUARD_TELEMETRY_TTL_DAYS", DEFAULTS.telemetryTtlDays),
    dailyModelCalls: int(env, "GUARD_DAILY_MODEL_CALLS", DEFAULTS.dailyModelCalls),
    ipHashSecret: ipHashSecret || DEV_IP_HASH_SECRET,
  };
}
