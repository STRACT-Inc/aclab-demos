"use client";

import { useSyncExternalStore } from "react";
import { getServerState, getState, subscribe } from "./store.ts";

/** 画面からストアを読む。React の外からの更新(ツール)もここに流れてくる */
export function useDemoState() {
  return useSyncExternalStore(subscribe, getState, getServerState);
}
