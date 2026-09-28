"use client";

import { useSyncExternalStore } from "react";
import { detectWebMcp, type WebMcpMode } from "./detect.ts";
import { mount } from "./registry.ts";
import { setNavigator } from "./tools.ts";

/**
 * 動作モードの読み取り。
 * 検出と global の登録はページに 1 回だけ行い(components/webmcp-runtime.tsx)、
 * 画面の各所はここで結果を読むだけにする。フックごとに検出と登録を走らせると、
 * global が「abort → 解除待ち → 再登録」を呼び出しの数だけ繰り返し、その隙に
 * ツール一覧が空になる(2026-09-17 のレビューで指摘)。
 */

export { scopeForPath } from "./registry.ts";

export interface WebMcpStatus {
  mode: WebMcpMode;
  /** 判定と global の登録が終わったか。失敗しても true にして、画面がモードを出せるようにする */
  ready: boolean;
}

const SERVER_STATUS: WebMcpStatus = { mode: "none", ready: false };

let status: WebMcpStatus = SERVER_STATUS;
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;

function setStatus(next: WebMcpStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getStatus = (): WebMcpStatus => status;
const getServerStatus = (): WebMcpStatus => SERVER_STATUS;

/**
 * 検出して global を登録する。2 回目以降は最初の結果を返す(StrictMode の二重実行や、
 * 呼び出し側が増えても登録は 1 回で済む)。
 */
export function startWebMcp(navigate: (path: string) => void): Promise<void> {
  setNavigator(navigate);
  return (started ??= (async () => {
    const detected = await detectWebMcp();
    setStatus({ mode: detected, ready: false });
    try {
      if (detected !== "none") await mount("global");
    } finally {
      setStatus({ mode: detected, ready: true });
    }
  })());
}

/** いまの動作モード。読むだけで、検出や登録は起こさない */
export function useWebMcp(): WebMcpStatus {
  return useSyncExternalStore(subscribe, getStatus, getServerStatus);
}
