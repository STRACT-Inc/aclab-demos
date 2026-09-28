/** API の共通レスポンス。本文には読者に見せる短い日本語だけを入れる */

export interface ApiError {
  code: string;
  message: string;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } satisfies ApiError }, status);
}

export function noContent(status = 204): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

/**
 * ハンドラを最初のリクエストまで組み立てない。
 * `next build` はルートを読み込んでメタデータを集めるので、環境変数が揃っていない
 * ビルド時に設定を読むとビルドごと落ちる。組み立てに失敗したら 503 を返してログに出す。
 */
export function lazyHandler(
  build: () => (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  let handler: ((req: Request) => Promise<Response>) | null = null;
  return async (req: Request) => {
    if (!handler) {
      try {
        handler = build();
      } catch (error) {
        console.error(JSON.stringify({ event: "handler_unavailable" }), error);
        return errorResponse("misconfigured", "一時的に利用できません", 503);
      }
    }
    return handler(req);
  };
}

/** SSE の 1 イベント。event 名と JSON の data を送る */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store, no-transform",
  connection: "keep-alive",
} as const;
