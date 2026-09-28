/**
 * WebMCP の型(Chrome 149〜156 の Origin Trial 時点)。
 * 出典: https://developer.chrome.com/docs/ai/webmcp/imperative-api と
 * https://github.com/webmachinelearning/webmcp
 *
 * OT の期間中は公開型が揺れる。ここは「こう来るはず」の宣言で、実際の差は
 * compat.ts が吸収する。ページ側のコードは必ず compat を通す。
 */

/** ツールが返す MCP の content ブロック */
export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
}

/** registerTool に渡す定義 */
export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: ToolAnnotations;
  execute: (input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

/** getTools() が返すもの。inputSchema は object か、その JSON 文字列で来る */
export interface RegisteredTool {
  name: string;
  description?: string;
  inputSchema?: object | string;
  annotations?: ToolAnnotations;
  origin?: string;
}

export interface RegisterOptions {
  signal?: AbortSignal;
  /** クロスオリジンに出す場合の許可オリジン(このデモでは使わない) */
  exposedTo?: string[];
}

export interface ModelContext extends EventTarget {
  registerTool(tool: WebMcpToolDefinition, options?: RegisterOptions): Promise<unknown>;
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  /** 仕様では RegisteredTool を渡す。実装によっては名前の文字列も通る(compat で両方試す) */
  executeTool(
    tool: RegisteredTool | string,
    args?: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }

  /** 宣言形フォーム: エージェントが送信したときに立つ */
  interface SubmitEvent {
    agentInvoked?: boolean;
    respondWith?: (result: Promise<unknown>) => void;
  }

  interface WindowEventMap {
    toolactivated: CustomEvent & { toolName?: string };
    toolcancel: CustomEvent & { toolName?: string };
  }
}

export {};
