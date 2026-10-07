"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PREV_MAX_ITEMS, QUERY_MAX_CHARS } from "../../core/ask-limits.ts";
import { formatJpy } from "../../core/format.ts";
import type { AskItem, AskResult } from "../../core/nlweb-response.ts";
import { PUBLIC_DEMO_ORIGIN } from "../../core/origin.ts";

/**
 * 会話検索の画面。NLWeb の /ask を中継 API 経由で呼び、返った商品を並べる。
 * サーバは無状態なので、前の質問(prev)はこの画面が持って次の質問に付ける。
 * deep link: /ask?q=<質問>&mode=<list|summarize|generate>&from=article(from=article のときだけ自動で送る)
 */

const MODES = [
  { value: "list", label: "一覧", note: "合う商品を並べる" },
  { value: "summarize", label: "要約つき", note: "一覧に短いまとめを添える" },
  { value: "generate", label: "文章で回答", note: "一覧をもとに文章で答える" },
] as const;
type Mode = (typeof MODES)[number]["value"];

interface Turn {
  query: string;
  mode: Mode;
  result?: AskResult;
  error?: string;
  ms?: number;
}

const MCP_URL = `${PUBLIC_DEMO_ORIGIN}/mcp`;
const CLAUDE_CODE_COMMAND = `claude mcp add --transport http aclab-nlweb ${MCP_URL}`;

function validMode(value: string | null): Mode {
  return MODES.some((mode) => mode.value === value) ? (value as Mode) : "list";
}

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskView />
    </Suspense>
  );
}

function AskView() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<Mode>(validMode(params.get("mode")));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const autoRan = useRef(false);

  async function ask(text: string, prevTurns: Turn[]) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const prev = prevTurns
      .filter((turn) => turn.result)
      .map((turn) => turn.query)
      .slice(-PREV_MAX_ITEMS);
    const started = Date.now();
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed, prev, mode }),
      });
      const body = (await response.json().catch(() => null)) as
        | AskResult
        | { error?: { message?: string } }
        | null;
      const ms = Date.now() - started;
      if (!response.ok || !body || !("items" in body)) {
        const message = body && "error" in body ? body.error?.message : undefined;
        setTurns((current) => [...current, { query: trimmed, mode, error: message ?? `HTTP ${response.status}`, ms }]);
      } else {
        setTurns((current) => [...current, { query: trimmed, mode, result: body, ms }]);
      }
    } catch {
      setTurns((current) => [...current, { query: trimmed, mode, error: "通信に失敗しました" }]);
    } finally {
      setBusy(false);
      setQuery("");
    }
  }

  // 記事からの deep link だけ自動で送る。ほかは読者が押すまで待つ(上限を無駄に使わない)
  useEffect(() => {
    const q = params.get("q");
    if (params.get("from") === "article" && q && !autoRan.current) {
      autoRan.current = true;
      void ask(q, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-[820px]">
      <p className="text-[12px] font-bold tracking-[0.18em] text-accent">NLWEB</p>
      <h1 className="mt-1.5 text-[24px] font-bold">会話で探す</h1>
      <p className="mt-2 text-[13.5px] leading-[1.9] text-muted">
        商品ページの構造化データ(schema.org Product)を NLWeb に取り込んだ索引に、日本語で聞けます。
        返ってくるのは索引にある商品だけで、説明文は AI が書きます。1 日の回数に上限があります。
      </p>

      <form
        className="card mt-6 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(query, turns);
        }}
      >
        <label htmlFor="ask-query" className="block text-[13px] font-bold">
          質問
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="ask-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={QUERY_MAX_CHARS}
            placeholder="渋みの少ない緑茶はありますか"
            className="field flex-1 rounded-full px-5"
            disabled={busy}
          />
          <button type="submit" className="btn btn-primary whitespace-nowrap px-6" disabled={busy || !query.trim()}>
            {busy ? "探しています" : "聞く"}
          </button>
        </div>
        <fieldset className="mt-4">
          <legend className="text-[12.5px] font-bold text-muted">答え方</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {MODES.map((option) => (
              <label key={option.value} className="chip cursor-pointer" data-active={mode === option.value}>
                <input
                  type="radio"
                  name="mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="sr-only"
                />
                {option.label}
                <span className="ml-1.5 text-[11.5px] text-muted">{option.note}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {turns.length > 0 && (
          <p className="mt-3 text-[12.5px] text-muted">
            前の質問 {Math.min(turns.length, PREV_MAX_ITEMS)} 件を引き継いでいます。
            <button type="button" className="ml-2 underline" onClick={() => setTurns([])}>
              会話をリセット
            </button>
          </p>
        )}
      </form>

      <ol className="mt-6 space-y-5">
        {turns.map((turn, index) => (
          <li key={`${index}-${turn.query}`} className="card p-5">
            <p className="text-[12px] text-muted">
              質問 {index + 1}(
              {MODES.find((option) => option.value === turn.mode)?.label}
              {turn.ms !== undefined ? ` / ${(turn.ms / 1000).toFixed(1)} 秒` : ""})
            </p>
            <p className="mt-1 text-[15px] font-bold">{turn.query}</p>
            {turn.error && <p className="mt-3 text-[13.5px] font-bold text-accent-ink">{turn.error}</p>}
            {turn.result && <Result result={turn.result} />}
          </li>
        ))}
      </ol>

      <section className="card mt-10 p-5">
        <h2 className="text-[15px] font-bold">AI からつなぐ</h2>
        <p className="mt-2 text-[13px] leading-[1.9] text-muted">
          同じ索引を MCP サーバとしても開いています。claude.ai は Settings → Connectors → Add custom connector に
          次の URL を入れます。Claude Code は下のコマンドで追加できます。ツールは <code>ask</code> /{" "}
          <code>list_sites</code> / <code>who</code> の 3 本です。
        </p>
        <pre className="mt-3 overflow-x-auto rounded-[10px] bg-surface-2 px-4 py-3 text-[12.5px]">
          <code>{MCP_URL}</code>
        </pre>
        <pre className="mt-2 overflow-x-auto rounded-[10px] bg-surface-2 px-4 py-3 text-[12.5px]">
          <code>{CLAUDE_CODE_COMMAND}</code>
        </pre>
        <p className="mt-3 text-[12.5px] text-muted">
          設定値や参照実装の版は <Link href="/lab" className="underline">lab</Link> にあります。
        </p>
      </section>
    </div>
  );
}

const TOOL_LABELS: Record<AskResult["tool"], string> = {
  search: "検索",
  details: "商品の詳細",
  compare: "比較",
  ensemble: "組み合わせ",
  generate: "文章で回答",
  none: "回答なし",
};

function Result({ result }: { result: AskResult }) {
  return (
    <div className="mt-4">
      <p className="text-[12px] text-muted">NLWeb の応答: {TOOL_LABELS[result.tool]}</p>
      {result.summary && <p className="mt-2 text-[13.5px] leading-[1.9]">{result.summary}</p>}
      {result.answer && <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.9]">{result.answer}</p>}
      {result.details && (
        <p className="mt-2 text-[13.5px] leading-[1.9]">
          <span className="font-bold">{result.details.name}</span>: {result.details.text}
        </p>
      )}
      {result.comparison && (
        <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.9]">{result.comparison.text}</p>
      )}
      {result.ensemble !== undefined && (
        <pre className="mt-2 overflow-x-auto rounded-[10px] bg-surface-2 px-4 py-3 text-[12px] leading-[1.7]">
          {JSON.stringify(result.ensemble, null, 2)}
        </pre>
      )}
      {!result.answered && (
        <p className="mt-2 text-[13.5px] text-muted">合う商品は見つかりませんでした</p>
      )}
      {result.errors.length > 0 && (
        <p className="mt-2 text-[12.5px] text-muted">サーバ側のエラー {result.errors.length} 件</p>
      )}
      {result.items.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {result.items.map((item) => (
            <ItemRow key={item.url} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: AskItem }) {
  const path = item.url.replace(/^https?:\/\/[^/]+/, "");
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link href={path || item.url} className="text-[14.5px] font-bold hover:text-accent-ink">
          {item.name || item.url}
        </Link>
        <span className="tnum text-[12.5px] text-muted">
          {item.price_jpy !== undefined ? formatJpy(item.price_jpy) : ""}
          {item.in_stock === false ? " / 在庫切れ" : ""}
          {` / score ${item.score}`}
        </span>
      </div>
      {item.description && <p className="mt-1 text-[13px] leading-[1.9]">{item.description}</p>}
    </li>
  );
}
