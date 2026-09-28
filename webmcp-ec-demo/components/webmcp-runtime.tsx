"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getState, subscribe } from "../state/store.ts";
import { mount, remount, scopeForPath, setMountOptions, unmount } from "../webmcp/registry.ts";
import { startWebMcp, useWebMcp } from "../webmcp/use-webmcp.ts";

/**
 * ページに合わせてツールを出し入れする。layout に 1 つだけ置く。
 * global は起動時に 1 回。ページ固有の scope はルートの変化で mount / unmount。
 * when を持つツールは、関係する状態が変わったら remount する。
 */

/** 説明文を変える設定。変わったら global まで入れ直す */
function describeKey(): string {
  const lab = getState().lab;
  return `${lab.descriptionLang}:${lab.reviewWarning ? 1 : 0}`;
}

/**
 * when の判定に関わる状態だけを 1 本の文字列にする(変化の検出用)。
 * 説明の言語は別に見る。言語は全 scope の説明文を変えるが、状態の変化で入れ直すのは
 * when を持つツールのある scope だけでよい。
 */
function conditionKey(): string {
  const state = getState();
  return [
    state.cart.lines.length,
    state.address === null ? 0 : 1,
    state.payment === null ? 0 : 1,
    state.loggedIn ? 1 : 0,
  ].join(":");
}

export function WebMcpRuntime() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, ready } = useWebMcp();

  // 検出と global の登録は 1 回だけ(startWebMcp が 2 回目以降を吸収する)
  useEffect(() => {
    void startWebMcp((path) => router.push(path));
  }, [router]);

  // ページ固有の scope
  useEffect(() => {
    if (!ready || mode === "none") return;
    const scope = scopeForPath(pathname);
    if (!scope) return;
    void mount(scope);
    return () => unmount(scope);
  }, [pathname, ready, mode]);

  // when と説明の言語の変化で入れ直す
  useEffect(() => {
    if (!ready || mode === "none") return;
    let previousCondition = conditionKey();
    let previousDescription = describeKey();

    return subscribe(() => {
      const state = getState();
      const scope = scopeForPath(pathname);

      // 説明の言語が変わったときだけ global を入れ直す。
      // 状態の変化で global まで入れ直すと、登録し直している隙にエージェントの
      // 連続した呼び出しが「ツールが無い」で落ちる(実機のチャットで発生)
      if (describeKey() !== previousDescription) {
        previousDescription = describeKey();
        setMountOptions({ lang: state.lab.descriptionLang });
        void mount("global");
        if (scope) void mount(scope);
        return;
      }

      const next = conditionKey();
      if (next === previousCondition) return;
      previousCondition = next;
      // when を持つツールがあるのはページ固有の scope だけ
      if (scope) void remount(scope);
    });
  }, [pathname, ready, mode]);

  return null;
}
