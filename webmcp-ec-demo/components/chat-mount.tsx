"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { DUMMY_ADDRESS } from "../core/checkout.ts";
import { SCENARIOS } from "../scenarios.ts";
import { SYSTEM_PROMPT } from "../system-prompt.ts";
import { actions } from "../state/store.ts";
import { MODE_LABELS } from "../webmcp/detect.ts";
import { createWebMcpExecutor } from "../webmcp/executor.ts";
import { useWebMcp } from "../webmcp/use-webmcp.ts";
import { useScenarioLink } from "./use-scenario-link.ts";

/**
 * WebMCP の検出・ツールの登録と、チャットの取り付け。
 * document を触るので Client Component の中で ssr: false で読み込む。
 * シナリオのチップと deep link もここで結ぶ。
 */
const ChatDrawer = dynamic(() => import("../chat/chat-drawer.tsx").then((mod) => mod.ChatDrawer), {
  ssr: false,
});

const CHIPS = SCENARIOS.map(({ id, label }) => ({ id, label }));

/**
 * BYO キーで直接呼ぶときの設定。
 * モデルはラボのサーバの既定と揃える。公開時は BYO キー自体が出ないので使われない。
 */
const DIRECT = {
  systemPrompt: SYSTEM_PROMPT,
  model: process.env.NEXT_PUBLIC_BYO_MODEL ?? "claude-haiku-4-5-20251001",
};

export function ChatMount() {
  const { mode } = useWebMcp();
  const executor = useMemo(() => createWebMcpExecutor(), []);
  const { launch, setupError, start, consume } = useScenarioLink();

  // 利用不可の環境ではチャットを出さない
  if (mode === "none") return null;

  return (
    <ChatDrawer
      executor={executor}
      modeBadge={MODE_LABELS[mode]}
      onDummyAddress={() => actions.saveAddress(DUMMY_ADDRESS)}
      scenarios={CHIPS}
      onScenario={(id) => {
        const scenario = SCENARIOS.find((item) => item.id === id);
        if (scenario) start(scenario);
      }}
      launch={launch ? { prompt: launch.scenario.prompt, openChat: launch.openChat } : null}
      onLaunched={consume}
      direct={DIRECT}
      notice={setupError}
    />
  );
}
