import { Redis } from "@upstash/redis";

/**
 * ガードのカウンタ・チャットのセッション予算・統計の要約を置くストア。
 * 本番は Upstash Redis、テストとローカルはメモリ実装を使う。
 * ストアに届かないときは例外を投げ、呼び出し側はチャットを止める。
 */
export interface Store {
  /** キーを 1 増やして返す。新しいキーのときだけ TTL を設定する(窓が伸び続けないように) */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** TTL 付きでハッシュを作る。既存の値は置き換える */
  hcreate(key: string, values: Record<string, number>, ttlSeconds: number): Promise<void>;
  /** キーがあるときだけフィールドを増やす。無ければ null(セッションの失効) */
  hincr(key: string, field: string, by: number): Promise<number | null>;
  /** キーがあるときだけ書く。TTL は変えない。無ければ false */
  hset(key: string, values: Record<string, number>): Promise<boolean>;
  /** ハッシュ全体。無ければ null */
  hgetall(key: string): Promise<Record<string, string> | null>;
  /** TTL 付きで文字列を書く。同じキーは上書きする */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

interface Entry {
  expiresAt: number;
  text?: string;
  hash?: Map<string, number>;
}

/**
 * メモリ実装。テストとローカル開発で使う。
 * 関数インスタンスをまたげないので、本番では使わない。
 */
export function memoryStore(now: () => number = Date.now): Store {
  const entries = new Map<string, Entry>();

  const live = (key: string): Entry | null => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };

  return {
    async incr(key, ttlSeconds) {
      const entry = live(key);
      if (!entry) {
        entries.set(key, { expiresAt: now() + ttlSeconds * 1000, text: "1" });
        return 1;
      }
      const next = Number(entry.text ?? "0") + 1;
      entry.text = String(next);
      return next;
    },
    async hcreate(key, values, ttlSeconds) {
      entries.set(key, {
        expiresAt: now() + ttlSeconds * 1000,
        hash: new Map(Object.entries(values)),
      });
    },
    async hincr(key, field, by) {
      const entry = live(key);
      if (!entry?.hash) return null;
      const next = (entry.hash.get(field) ?? 0) + by;
      entry.hash.set(field, next);
      return next;
    },
    async hset(key, values) {
      const entry = live(key);
      if (!entry?.hash) return false;
      for (const [field, value] of Object.entries(values)) entry.hash.set(field, value);
      return true;
    },
    async hgetall(key) {
      const entry = live(key);
      if (!entry?.hash) return null;
      return Object.fromEntries([...entry.hash].map(([k, v]) => [k, String(v)]));
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { expiresAt: now() + ttlSeconds * 1000, text: value });
    },
  };
}

/**
 * 常に失敗するストア。本番で接続情報が無いときに使う。
 * 上限を数えられない状態でチャットを動かさないための fail closed。
 */
export function unavailableStore(): Store {
  const fail = async (): Promise<never> => {
    throw new Error("ストアの接続情報がありません");
  };
  return {
    incr: fail,
    hcreate: fail,
    hincr: fail,
    hset: fail,
    hgetall: fail,
    set: fail,
  };
}

/** INCR と EXPIRE を 1 往復で行う。TTL は初回だけ付ける */
const INCR_WITH_TTL = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

/** キーがあるときだけ HINCRBY する。無ければ -1(TTL 無しのキーを作らないため) */
const HINCR_IF_EXISTS = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
return redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])`;

/** キーがあるときだけ HSET する。TTL は変えない */
const HSET_IF_EXISTS = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
for i = 1, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
return 1`;

/** TTL 付きでハッシュを作り直す */
const HCREATE = `
redis.call('DEL', KEYS[1])
for i = 2, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
redis.call('EXPIRE', KEYS[1], ARGV[1])
return 1`;

/** Upstash Redis 実装。Vercel の Marketplace 連携が入れる環境変数で接続する */
export function upstashStore(redis: Redis): Store {
  const flatten = (values: Record<string, number>): (string | number)[] =>
    Object.entries(values).flatMap(([field, value]) => [field, value]);

  return {
    async incr(key, ttlSeconds) {
      return Number(await redis.eval(INCR_WITH_TTL, [key], [ttlSeconds]));
    },
    async hcreate(key, values, ttlSeconds) {
      await redis.eval(HCREATE, [key], [ttlSeconds, ...flatten(values)]);
    },
    async hincr(key, field, by) {
      const result = Number(await redis.eval(HINCR_IF_EXISTS, [key], [field, by]));
      return result === -1 ? null : result;
    },
    async hset(key, values) {
      const result = Number(await redis.eval(HSET_IF_EXISTS, [key], flatten(values)));
      return result === 1;
    },
    async hgetall(key) {
      const hash = await redis.hgetall<Record<string, unknown>>(key);
      if (!hash || Object.keys(hash).length === 0) return null;
      return Object.fromEntries(Object.entries(hash).map(([k, v]) => [k, String(v)]));
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}

/**
 * 環境変数からストアを作る。接続情報が無ければ null を返す。
 * ★変数名は Marketplace 連携をつないだ時点で確認し、README に書く。
 */
export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return upstashStore(new Redis({ url, token }));
}
