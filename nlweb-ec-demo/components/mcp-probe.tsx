"use client";

import { useState } from "react";

/** /mcp に tools/list を送り、生の応答を見せる。LLM は呼ばないので上限を使わない */
export function McpProbe() {
  const [output, setOutput] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function probe() {
    setBusy(true);
    try {
      const response = await fetch("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const text = await response.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // 応答が JSON でなければそのまま見せる
      }
      setOutput(`HTTP ${response.status}\n${pretty}`);
    } catch (error) {
      setOutput(`通信に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void probe()} disabled={busy} className="btn btn-outline">
        {busy ? "問い合わせ中" : "tools/list を送る"}
      </button>
      {output && (
        <pre className="mt-3 max-h-[420px] overflow-auto rounded-[10px] bg-surface-2 px-4 py-3 text-[12px] leading-[1.7]">
          {output}
        </pre>
      )}
    </div>
  );
}
