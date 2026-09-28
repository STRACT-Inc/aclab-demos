"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isError } from "../core/errors.ts";
import { parseScenarioLink, scenarioHref, type Scenario } from "../scenarios.ts";
import { STORAGE_KEYS } from "../state/keys.ts";
import { actions } from "../state/store.ts";

/**
 * シナリオの deep link とチップ。
 * 記事のリンクもチップも同じ経路を通る: 前提のページへ移り、そこでブラウザ内の状態を
 * 前提まで作り、チャットに一言を投入する。
 *
 * クエリは `usePathname` の変化を合図に `window.location` から読む。`useSearchParams` は
 * レイアウトに置くと Suspense の境界を要求するため使わない。
 */

export interface ScenarioLaunch {
  scenario: Scenario;
  /** チャットを開いて自動で送るか(deep link に `open=chat` があるとき) */
  openChat: boolean;
}

export function useScenarioLink() {
  const router = useRouter();
  const pathname = usePathname();
  const [launch, setLaunch] = useState<ScenarioLaunch | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  /** 同じ URL で二度作り直さないための目印 */
  const handled = useRef<string | null>(null);

  const apply = useCallback((scenario: Scenario, openChat: boolean) => {
    const result = actions.applyScenarioSetup(scenario.setup);
    if (isError(result)) {
      // 前提を作れないのはシナリオ定義の誤り。黙って始めると合否の判定がずれる
      setSetupError(`${scenario.label}: ${result.error.message}`);
      return;
    }
    setSetupError(null);
    setLaunch({ scenario, openChat });
  }, []);

  useEffect(() => {
    const href = `${pathname}${window.location.search}`;
    if (handled.current === href) return;
    handled.current = href;

    const link = parseScenarioLink(window.location.search);
    if (!link) return;

    if (pathname !== link.scenario.path) {
      router.replace(scenarioHref(link.scenario, link.fromArticle ? "article" : undefined));
      return;
    }
    if (link.fromArticle) {
      try {
        window.sessionStorage.setItem(STORAGE_KEYS.entry, JSON.stringify({ from_article: true }));
      } catch {
        /* 保存できなくてもデモは動く */
      }
    }
    // 前提を作り終えたらクエリを消す。再読み込みで作り直さないため
    window.history.replaceState(null, "", link.scenario.path);
    apply(link.scenario, link.openChat);
  }, [apply, pathname, router]);

  /** チップから。前提のページが違うときは deep link に載せ替えて移る */
  const start = useCallback(
    (scenario: Scenario) => {
      if (window.location.pathname !== scenario.path) {
        router.push(scenarioHref(scenario));
        return;
      }
      apply(scenario, true);
    },
    [apply, router],
  );

  /** 投入が済んだら消す(同じチップをもう一度押せるようにする) */
  const consume = useCallback(() => setLaunch(null), []);

  return { launch, setupError, start, consume };
}
