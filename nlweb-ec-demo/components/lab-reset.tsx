"use client";

import { useState } from "react";
import { actions } from "../state/store.ts";

/** ブラウザに残るカート・注文・ログインを消す(テンプレート由来。/lab で使う) */
export function LabReset() {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          actions.resetAll();
          setDone(true);
        }}
        className="btn btn-outline"
      >
        すべて消す
      </button>
      {done && (
        <span role="status" className="text-[13px] font-bold text-accent-ink">
          消しました
        </span>
      )}
    </div>
  );
}
