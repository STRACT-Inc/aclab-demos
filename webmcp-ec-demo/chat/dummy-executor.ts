import type { ToolExecutor } from "./types.ts";

/**
 * テンプレート用のダミー。ツールを 1 本も出さないので、チャットは会話だけになる。
 * 話題ごとのデモはこれを差し替える(WebMCP のデモなら document.modelContext を読む実装)。
 */
export function createDummyExecutor(): ToolExecutor {
  return {
    async listTools() {
      return [];
    },
    async execute(name) {
      return { error: { code: "not_supported", message: `${name} はこのデモにありません` } };
    },
    subscribe() {
      return () => {};
    },
  };
}
