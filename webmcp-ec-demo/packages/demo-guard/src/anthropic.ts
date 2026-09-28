import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "./chat.ts";

/**
 * Anthropic SDK を ModelClient に合わせる薄い層。
 * クライアントは最初の呼び出しまで作らない(API キーが無い状態でビルドを落とさないため)。
 * テストではこの層を通さず、偽の ModelClient を渡す。
 */
export function anthropicModelClient(factory: () => Anthropic = () => new Anthropic()): ModelClient {
  let client: Anthropic | null = null;
  return {
    stream(params, options) {
      client ??= factory();
      return client.messages.stream(params, options);
    },
  };
}
