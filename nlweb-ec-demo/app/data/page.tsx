import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "このデモが送るもの・送らないもの",
};

/**
 * プライバシーポリシーの改定が済むまでの説明ページ。
 * 統計を有効にしたら、この文面も合わせて直す。
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4 p-6">
      <h2 className="text-[16px] font-bold">{title}</h2>
      <div className="mt-2 text-[14px] leading-[2.0]">{children}</div>
    </section>
  );
}

export default function DataPage() {
  return (
    <div className="mx-auto max-w-[720px]">
      <p className="text-[12px] font-bold tracking-[0.18em] text-accent">PRIVACY</p>
      <h1 className="mt-1.5 text-[24px] font-bold">このデモが送るもの・送らないもの</h1>

      <Section title="統計は取っていません">
        このデモは、利用状況の統計を集めていません。ブラウザから統計用のデータを送る仕組みは、
        設定で止めてあります。再開するときは、プライバシーポリシーを改定し、このページと同意の画面で
        先にお知らせします。
      </Section>

      <Section title="チャットに書いた内容">
        チャットに入力した文章と、ページのツールが返した結果は、ラボのサーバを経由して Anthropic の
        API に送られ、応答の生成に使われます。ラボはこれらの内容を保存しません。サーバのログにも
        残しません。住所や氏名は架空のものを使ってください。
      </Section>

      <Section title="カートや注文">
        カート・注文・ログイン状態・配送先は、お使いのブラウザの中だけに保存されます。サーバには
        送りません。
        <Link href="/lab" className="mx-1 text-accent-ink underline underline-offset-2">
          lab
        </Link>
        の「すべて消す」でいつでも消せます。
      </Section>

      <Section title="アクセスの記録">
        ページを開くと、ホスティング(Vercel)にアクセスの記録が残ります。これは Web サイトの配信に
        伴うもので、デモのアプリはこの記録を保存も分析もしていません。アクセス解析のスクリプトは
        このデモに入れていません。
      </Section>

      <Section title="乱用を防ぐための数え上げ">
        チャットの呼び出し回数を上限内に収めるため、IP アドレスから作った不可逆のハッシュを、最長
        1 時間だけ数え上げに使います。ハッシュは日ごとに変わり、値そのものは保存しません。
      </Section>

      <p className="mt-6 text-[13px] text-muted">
        商品・レビュー・注文はすべて架空です。実際の決済も配送もありません。
      </p>
    </div>
  );
}
