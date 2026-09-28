"use client";

import { useEffect, useRef, useState } from "react";
import { CONSENT_VERSION, STORAGE_KEYS } from "../state/keys.ts";
import { useDemoState } from "../state/use-store.ts";
import { BYO_KEY_ENABLED, clearByoKey, looksLikeKey, readByoKey, writeByoKey } from "./byo-key.ts";
import { MAX_USER_CHARS, useChat, type DirectConfig } from "./use-chat.ts";
import type { ToolExecutor } from "./types.ts";

/**
 * ページ内エージェントのドロワー。
 * 送信の同意を取るまで会話を始めない。統計のチェックは、統計を有効にしてから出す。
 */

const TELEMETRY_ENABLED = process.env.NEXT_PUBLIC_TELEMETRY_ENABLED === "true";

interface Consent {
  stats: boolean;
  chat: boolean;
  version: string;
  at: string;
}

function readConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.consent);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Consent;
    return parsed.version === CONSENT_VERSION && parsed.chat ? parsed : null;
  } catch {
    return null;
  }
}

function writeConsent(stats: boolean): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.consent,
      JSON.stringify({
        stats,
        chat: true,
        version: CONSENT_VERSION,
        at: new Date().toISOString(),
      } satisfies Consent),
    );
  } catch {
    /* 保存できなくてもチャットは使える */
  }
}

/** チップに出すシナリオ。話題ごとのデモが渡す */
export interface ScenarioChip {
  id: string;
  label: string;
}

/** deep link かチップで決まった投入。同じ id でも押すたびに新しいオブジェクトで渡す */
export interface ChatLaunch {
  prompt: string;
  /** ドロワーを開いて自動で送るか */
  openChat: boolean;
}

export function ChatDrawer({
  executor,
  modeBadge = "ツールなし",
  onDummyAddress,
  scenarios = [],
  onScenario,
  launch = null,
  direct,
  onLaunched,
  notice = null,
}: {
  executor: ToolExecutor;
  /** native / polyfill / 利用不可 を出す。テンプレートは「ツールなし」 */
  modeBadge?: string;
  /** 架空の住所をフォームに入れる(同意パネルのボタン) */
  onDummyAddress?: () => void;
  scenarios?: readonly ScenarioChip[];
  onScenario?: (id: string) => void;
  launch?: ChatLaunch | null;
  /** BYO キーで直接呼ぶために要るもの。渡さなければ経路ごと無い */
  direct?: DirectConfig;
  /** 投入を受け取ったことを親に返す */
  onLaunched?: () => void;
  /** 前提を作れなかったときなどの断り書き */
  notice?: string | null;
}) {
  const state = useDemoState();
  const chat = useChat(
    executor,
    { hintIgnored: state.lab.hintIgnored, harnessConfirm: state.lab.harnessConfirm },
    direct,
  );
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [consented, setConsented] = useState<boolean | null>(null);
  const [statsOptIn, setStatsOptIn] = useState(false);
  /** 同意がまだのときは、同意を取ってから送る */
  const [pending, setPending] = useState<string | null>(null);
  const sending = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keySet, setKeySet] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // 新しい発話やツールカードが付いたら末尾へ寄せる。寄せないと、長いシナリオでは
  // 最後の返事が画面の外に残る(2026-09-17 の収録で tshirt-coupon の最終画面が途中のまま)
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat.entries.length, chat.busy, chat.error, chat.confirming]);

  // 保存済みかどうかだけを見る。キーそのものは画面に戻さない
  useEffect(() => {
    if (BYO_KEY_ENABLED && direct) setKeySet(readByoKey() !== null);
  }, [direct]);

  const ready = consented ?? (typeof window !== "undefined" && readConsent() !== null);
  const hasChips = ready && scenarios.length > 0 && onScenario !== undefined;

  useEffect(() => {
    if (!launch) return;
    if (launch.openChat) setOpen(true);
    setPending(launch.prompt);
    onLaunched?.();
  }, [launch, onLaunched]);

  // シナリオの一言は、前の会話を捨てて 1 発話目として送る(判定を揃えるため)。
  // useChat の戻り値は毎レンダー新しいので、後片付けで取り消すと送信自体が消える。
  // 二重送信は ref で止める
  useEffect(() => {
    if (pending === null || !ready || chat.busy || sending.current) return;
    const text = pending;
    const send = chat.send;
    sending.current = true;
    setPending(null);
    void (async () => {
      try {
        // 前提を作った直後は条件付きツールの入れ直しが終わっていない(実機で place_order が欠けた)
        await executor.settle?.();
        await send(text, { fresh: true });
      } finally {
        sending.current = false;
      }
    })();
  }, [chat, executor, pending, ready]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary fixed bottom-5 right-5 z-40 shadow-[var(--shadow-lift)]"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
          <path
            d="M3 4.5h14v9H8.5L4.5 17v-3.5H3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        チャットで買い物する
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-[var(--shadow-lift)] sm:w-[400px]">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-[12.5px]">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 font-bold text-accent-ink">
          {modeBadge}
        </span>
        <span>ツール {chat.tools.length} 本</span>
        {chat.turnsLeft !== null && <span>残り {chat.turnsLeft} 回</span>}
        <button type="button" onClick={chat.reset} className="ml-auto text-muted underline underline-offset-2 hover:text-accent-ink">
          リセット
        </button>
        {BYO_KEY_ENABLED && direct && (
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="text-muted underline underline-offset-2 hover:text-accent-ink"
          >
            設定{keySet ? "(自分のキー)" : ""}
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} aria-label="閉じる">
          ×
        </button>
      </div>

      {!ready ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 text-[13.5px] leading-[1.9]">
          <p className="font-bold">チャットを始める前に</p>
          <p className="mt-2">
            入力内容と、ページのツールが返した結果は、ラボのサーバを経由して Anthropic の API
            に送られ、応答の生成に使われます。ラボはこれらの内容を保存しません。住所や氏名は架空のものを使ってください。
          </p>
          {onDummyAddress && (
            <button
              type="button"
              onClick={onDummyAddress}
              className="btn btn-outline mt-3 py-2 text-[13px]"
            >
              ダミー住所を使う
            </button>
          )}
          {TELEMETRY_ENABLED && (
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={statsOptIn}
                onChange={(event) => setStatsOptIn(event.target.checked)}
                className="mt-1"
              />
              <span>
                統計に協力する(送るのはツール呼び出しの回数と結果、往復数だけ。文章は送りません)
              </span>
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              writeConsent(TELEMETRY_ENABLED && statsOptIn);
              setConsented(true);
            }}
            className="btn btn-primary mt-4 w-full py-2.5"
          >
            開始する
          </button>
        </div>
      ) : (
        <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-3 text-[13.5px] leading-[1.9]">
          {chat.entries.length === 0 && (
            <p className="text-[13px]">
              「3,000 円以内で贈り物向けの日本茶を探して」のように話しかけてください。
            </p>
          )}
          {notice && <p className="mt-3 font-bold text-accent-ink">{notice}</p>}
          {settingsOpen && BYO_KEY_ENABLED && direct && (
            <div className="card mt-3 p-3 text-[12.5px] leading-[1.9]">
              <p className="font-bold">自分の API キーを使う</p>
              <p className="mt-1">
                入れると、ラボのサーバを通らずブラウザから Anthropic API
                を直接呼びます。キーはこのタブにだけ置き、ラボのサーバへは送りません。タブを閉じると消えます。
              </p>
              <input
                type="password"
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder={keySet ? "保存済み(入れ直すと上書き)" : "sk-ant-..."}
                autoComplete="off"
                className="field mt-2 text-[12.5px]"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!looksLikeKey(keyDraft)}
                  onClick={() => {
                    writeByoKey(keyDraft);
                    setKeyDraft("");
                    setKeySet(true);
                    setSettingsOpen(false);
                  }}
                  className="btn btn-primary px-4 py-1.5 text-[12.5px] disabled:opacity-40"
                >
                  保存
                </button>
                {keySet && (
                  <button
                    type="button"
                    onClick={() => {
                      clearByoKey();
                      setKeySet(false);
                    }}
                    className="btn btn-outline px-4 py-1.5 text-[12.5px]"
                  >
                    消す
                  </button>
                )}
              </div>
            </div>
          )}
          {chat.entries.map((entry, index) => {
            if (entry.kind === "user") {
              return (
                <p key={index} className="ml-auto mt-3 max-w-[85%] rounded-[12px] rounded-br-[4px] bg-accent-soft px-3.5 py-2.5 font-bold">
                  {entry.text}
                </p>
              );
            }
            if (entry.kind === "assistant") {
              return (
                <p key={index} className="mt-3 whitespace-pre-wrap">
                  {entry.text}
                </p>
              );
            }
            if (entry.kind === "notice") {
              return (
                <p key={index} className="mt-3 text-[12.5px]">
                  {entry.text}
                </p>
              );
            }
            return (
              <details key={entry.id} className="card mt-3 px-3 py-2">
                <summary className="cursor-pointer text-[12.5px] font-bold">
                  {entry.name}
                  {entry.ms === undefined ? `(${entry.status})` : `(${entry.status}, ${entry.ms}ms)`}
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-[8px] bg-bg p-2 text-[11.5px]">
                  {JSON.stringify({ args: entry.args, result: entry.result }, null, 2)}
                </pre>
              </details>
            );
          })}
          {chat.error && <p className="mt-3 font-bold text-accent-ink">{chat.error}</p>}
          {chat.error?.includes("本日の上限") && BYO_KEY_ENABLED && direct && !keySet && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn btn-outline mt-2 px-4 py-1.5 text-[12.5px]"
            >
              自分の API キーで続ける
            </button>
          )}
          {chat.confirming && (
            <div className="card mt-3 border-accent p-3">
              <p className="font-bold">{chat.confirming.name} を実行しますか</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => chat.confirming?.resolve(true)}
                  className="btn btn-primary px-4 py-2 text-[13px]"
                >
                  実行する
                </button>
                <button
                  type="button"
                  onClick={() => chat.confirming?.resolve(false)}
                  className="btn btn-outline px-4 py-2 text-[13px]"
                >
                  取り消す
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {hasChips && (
        <div className="flex flex-wrap gap-2 border-t border-line px-3 pt-3">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              disabled={chat.busy}
              onClick={() => onScenario(scenario.id)}
              className="btn btn-outline px-3 py-1.5 text-[12.5px] disabled:opacity-40"
            >
              {scenario.label}
            </button>
          ))}
        </div>
      )}

      {ready && (
        <form
          className={hasChips ? "p-3" : "border-t border-line p-3"}
          onSubmit={(event) => {
            event.preventDefault();
            const text = input;
            setInput("");
            void chat.send(text);
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, MAX_USER_CHARS))}
            rows={2}
            placeholder="買い物の指示を書く"
            className="field resize-none text-[13.5px]"
          />
          <div className="mt-2 flex items-center gap-3 text-[12px]">
            <span>
              {input.length} / {MAX_USER_CHARS}
            </span>
            {chat.busy ? (
              <button
                type="button"
                onClick={chat.stop}
                className="btn btn-outline ml-auto py-2 text-[13px]"
              >
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={input.trim().length === 0}
                className="btn btn-primary ml-auto px-5 py-2 text-[13px] disabled:opacity-40"
              >
                送信
              </button>
            )}
          </div>
        </form>
      )}
    </aside>
  );
}
