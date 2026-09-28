"use client";

import { MODE_LABELS } from "../webmcp/detect.ts";
import { useWebMcp } from "../webmcp/use-webmcp.ts";

/**
 * 動作モードのバッジ。
 * native / polyfill / 利用不可 を画面に常時出す。読者が「いま何が動いているか」を
 * 取り違えないようにするため。
 */
export function ModeBadge() {
  const { mode, ready } = useWebMcp();
  if (!ready) return null;

  const tone =
    mode === "native"
      ? "bg-accent text-white"
      : mode === "polyfill"
        ? "bg-accent-soft text-accent-ink"
        : "bg-line text-muted";

  return (
    <span
      className={`hidden rounded-full px-2.5 py-1 text-[11.5px] font-bold sm:inline-flex ${tone}`}
      title="document.modelContext の状態"
    >
      {MODE_LABELS[mode]}
    </span>
  );
}
