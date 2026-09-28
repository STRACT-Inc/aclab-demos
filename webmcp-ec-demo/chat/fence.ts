import type { ToolDecl } from "./types.ts";

/**
 * untrustedContentHint のツール結果の扱い。
 * これはラボのハーネスの実装で、ブラウザや拡張の公式挙動ではない。
 * 記事の A/B では hintIgnored を切り替えて、囲いの有無を比べる。
 */

export interface ChatSettings {
  /** hint を無視する(記事の A/B の対照条件) */
  hintIgnored: boolean;
  /** consequential なツールの前に確認を出す */
  harnessConfirm: boolean;
}

/** 制御文字と幅を持たない文字。見えない指示の運び手になるので落とす */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2060-\u2064\uFEFF]/g;
/** 偽の囲い。囲いから抜け出そうとする閉じタグを含む */
const FAKE_FENCE = /<\/?(tool_result|untrusted_content|system|assistant|human)[^>]*>/gi;

export function fenceToolResult(
  raw: unknown,
  tool: ToolDecl | undefined,
  settings: ChatSettings,
): string {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (settings.hintIgnored || !tool?.annotations?.untrustedContentHint) return text;
  const cleaned = text.replace(INVISIBLE, "").replace(FAKE_FENCE, "[removed]");
  return `<untrusted_content tool="${tool.name}">\n${cleaned}\n</untrusted_content>`;
}
