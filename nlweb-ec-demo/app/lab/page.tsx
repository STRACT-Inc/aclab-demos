import { loadConfig } from "@aclab/demo-guard";
import { LabReset } from "../../components/lab-reset.tsx";
import { McpProbe } from "../../components/mcp-probe.tsx";
import { NLWEB_META } from "../../core/nlweb-meta.ts";
import { PUBLIC_DEMO_ORIGIN } from "../../core/origin.ts";

/**
 * 開発者向けのページ。参照実装の版、当てたパッチ、上限、curl の例、tools/list の生の応答。
 * 読者に見せてよい情報だけを置く。NLWeb サーバ側のモデル名は Railway の環境変数にあり、ここには出ない。
 */
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="tnum text-[13px] font-bold sm:text-right">{value}</dd>
    </div>
  );
}

function limits(): { perIp: string; daily: string } {
  try {
    const config = loadConfig();
    return {
      perIp: `${config.requestRate.limit} 回 / ${Math.round(config.requestRate.windowSeconds / 60)} 分`,
      daily: `${config.dailyModelCalls} 回 / 日(JST)`,
    };
  } catch {
    return { perIp: "未設定", daily: "未設定" };
  }
}

export default function LabPage() {
  const { perIp, daily } = limits();
  const askCurl = `curl -X POST ${PUBLIC_DEMO_ORIGIN}/api/ask \\
  -H 'content-type: application/json' \\
  -d '{"query":"渋みの少ない緑茶はありますか","mode":"list"}'`;
  const mcpCurl = `curl -X POST ${PUBLIC_DEMO_ORIGIN}/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ask","arguments":{"query":"渋みの少ない緑茶はありますか"}}}'`;

  return (
    <div className="max-w-[760px]">
      <p className="text-[12px] font-bold tracking-[0.18em] text-accent">DEVELOPER</p>
      <h1 className="mt-1.5 text-[24px] font-bold">lab</h1>
      <p className="mt-2 text-[13.5px] text-muted">
        このデモの構成と設定。読者に見せてよい情報だけを置いています。
      </p>

      <section className="card mt-6 px-5 py-2">
        <dl>
          <Row
            label="参照実装"
            value={
              <a href={`${NLWEB_META.repo}/tree/${NLWEB_META.sha}`} className="underline">
                nlweb-ai/NLWeb {NLWEB_META.sha.slice(0, 7)}({NLWEB_META.shaDate})
              </a>
            }
          />
          <Row label="API バージョン" value={NLWEB_META.apiVersion} />
          <Row label="埋め込み" value={NLWEB_META.embeddingModel} />
          <Row label="ベクタ DB" value={NLWEB_META.vectorStore} />
          <Row label="索引の site" value={NLWEB_META.site} />
          <Row label="MCP のツール" value={NLWEB_META.tools.join(" / ")} />
          <Row label="上限(IP ごと)" value={perIp} />
          <Row label="上限(全体)" value={daily} />
        </dl>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-[15px] font-bold">参照実装に当てた変更</h2>
        <p className="mt-2 text-[13px] leading-[1.9] text-muted">
          差分は demos の <code>server/patches/</code> にあります。設定ファイル(モデル名・埋め込み・Qdrant・production
          モード)は <code>server/config/</code> で丸ごと置き換えています。
        </p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {NLWEB_META.patches.map((patch) => (
            <li key={patch.id}>
              <span className="font-bold">{patch.id}</span> <code>{patch.file}</code>
              <span className="block text-muted">{patch.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-[15px] font-bold">curl で試す</h2>
        <p className="mt-2 text-[13px] text-muted">/api/ask は 1 回で上限を 1 消費します。/mcp の tools/call も同じです。</p>
        <pre className="mt-3 overflow-x-auto rounded-[10px] bg-surface-2 px-4 py-3 text-[12px] leading-[1.7]">
          <code>{askCurl}</code>
        </pre>
        <pre className="mt-2 overflow-x-auto rounded-[10px] bg-surface-2 px-4 py-3 text-[12px] leading-[1.7]">
          <code>{mcpCurl}</code>
        </pre>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-[15px] font-bold">MCP の tools/list</h2>
        <p className="mt-2 text-[13px] text-muted">参照実装がそのまま返す応答です(protocolVersion は 2024-11-05 で固定)。</p>
        <div className="mt-3">
          <McpProbe />
        </div>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-[15px] font-bold">リセット</h2>
        <p className="mt-2 text-[13px] leading-[1.9] text-muted">
          カート・注文・ログインを消します。このブラウザの中だけの操作です。
        </p>
        <div className="mt-4">
          <LabReset />
        </div>
      </section>
    </div>
  );
}
