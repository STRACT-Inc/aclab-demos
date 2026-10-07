/**
 * NLWeb の SSE 応答(`data: {json}` の行)を辞書の配列にする。
 * 参照実装は 1 行 1 JSON で送り、30 秒ごとに `: keepalive` のコメント行を挟む。
 * compare の結果は end-nlweb-response の後に届くことがあるので、切断まで読んだ全文を渡す。
 * 非ストリーミング(streaming=false)は Message.to_dict() が content 以外の欄を落とすため使わない。
 */
export function parseSse(text: string): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    const payload = rawLine.slice(5).trim();
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        messages.push(parsed as Record<string, unknown>);
      }
    } catch {
      // 壊れた行は捨てる。件数は message_types の欠けとして残る
    }
  }
  return messages;
}
