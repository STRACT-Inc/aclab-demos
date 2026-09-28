/**
 * ページ内エージェントがツールを見つけて呼ぶための取り決め。
 * テンプレートはダミー実装だけを持ち、話題ごとのデモが差し替える。
 * WebMCP のデモでは compat.getTools() / executeTool() を呼ぶ実装を入れる。
 */

export interface ToolDecl {
  name: string;
  description?: string;
  input_schema?: unknown;
  inputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
  };
}

export interface ToolExecutor {
  listTools(): Promise<ToolDecl[]>;
  execute(name: string, args: object, opts: { signal: AbortSignal }): Promise<unknown>;
  /** 一覧が変わったら通知する(WebMCP では toolchange に結ぶ) */
  subscribe(onChange: () => void): () => void;
  /**
   * 登録の入れ直しが終わるまで待つ。シナリオの前提を作った直後に一覧を引くと、
   * 条件付きのツールが欠ける実装があるため(WebMCP がそれ)。
   */
  settle?(): Promise<void>;
}

/** 画面に出す 1 行 */
export type ChatEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: unknown;
      result?: unknown;
      ms?: number;
      status: "running" | "done" | "error" | "aborted";
    }
  | { kind: "notice"; text: string };

/** 打ち切りの理由(統計の stopped_by と同じ語) */
export type StoppedBy = "done" | "limit" | "abort";
