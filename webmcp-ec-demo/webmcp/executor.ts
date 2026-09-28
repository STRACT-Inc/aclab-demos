import type { ToolDecl, ToolExecutor } from "../chat/types.ts";
import { executeTool, findTool, getTools } from "./compat.ts";
import { DECLARATIVE_TOOL_NAME } from "./tools.ts";
import { modelContext } from "./detect.ts";
import { annotationsFor, markInternalCall, settled } from "./registry.ts";

/**
 * ページ内エージェント用の ToolExecutor。
 * 自前のレジストリを直接叩かず、必ず document.modelContext を経由する。
 * 経由することで、拡張や内蔵エージェントと同じ道を通っているか確かめられる。
 */

/**
 * 宣言形フォームを待つ上限。
 * Chrome 152 では、toolautosubmit を付けないフォームの executeTool は解決しない。
 * 利用者が保存を押しても agentInvoked は false のままで、respondWith も効かない(実測)。
 * 待ち続けると会話が止まるので、時間で切って「入力済み。保存は利用者が押す」と返す。
 */
const DECLARATIVE_TIMEOUT_MS = 4_000;

/** ツールが見つからないときに、登録し直しの完了を待つ時間 */
const RETRY_WAIT_MS = 300;

/** 時間で切って、待っていた合図を返す */
function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export function createWebMcpExecutor(): ToolExecutor {
  return {
    async listTools(): Promise<ToolDecl[]> {
      const context = modelContext();
      if (!context) return [];
      const tools = await getTools(context);
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        input_schema: tool.inputSchema ?? { type: "object", properties: {} },
        // ブラウザが落とした hint をページ側のカタログで補う(consequentialHint が落ちる)。
        // 宣言形フォームのようにカタログに無いものは、ブラウザの値をそのまま使う
        annotations: { ...tool.annotations, ...annotationsFor(tool.name) },
      }));
    },

    async execute(name, args, opts) {
      const context = modelContext();
      if (!context) {
        return { error: { code: "webmcp_unavailable", message: "ツールを実行できません" } };
      }
      let tool = findTool(await getTools(context), name);
      if (!tool) {
        // 登録し直している最中かもしれない。1 度だけ待って引き直す
        await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
        tool = findTool(await getTools(context), name);
      }
      if (!tool) {
        return {
          error: {
            code: "tool_not_found",
            message: `${name} はいま登録されていません`,
            hint: "ページが変わるとツールも変わります。一覧を取り直してください",
          },
        };
      }
      // ラボのチャットからの呼び出しであることを記録する(外部からの呼び出しと分けるため)
      const call = markInternalCall(() => executeTool(context, tool, args, opts));
      if (name !== DECLARATIVE_TOOL_NAME) return call;

      return withTimeout(call, DECLARATIVE_TIMEOUT_MS, () => ({
        status: "filled_awaiting_user",
        note: "フォームに入力しました。保存は利用者が押します。押されるまで結果は返りません",
      }));
    },

    settle() {
      return settled();
    },

    subscribe(onChange) {
      const context = modelContext();
      if (!context) return () => {};
      context.addEventListener("toolchange", onChange);
      return () => context.removeEventListener("toolchange", onChange);
    },
  };
}
