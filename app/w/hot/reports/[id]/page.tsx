import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server";
import { readAiReport } from "@/lib/ai";
import { PrintButton } from "@/components/hot/print-button";

export const metadata = { title: "AI 解读" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/** AI 解读的阅读 / 打印页（浏览器「打印 → 存为 PDF」就是 PDF 导出，零新依赖） */
export default async function AiReportPage({ params }: { params: Params }) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/hot");
  const { id } = await params;

  const report = readAiReport(id);
  if (!report) notFound();

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/w/hot" className="text-xs text-muted-foreground hover:text-primary">
          ← 回热点信息
        </Link>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>

      <article className="glass rounded-2xl p-6 sm:p-9 print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
        <h1 className="font-heading text-2xl font-bold leading-snug">{report.headline}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {report.at} · {report.model}
        </p>
        {report.overview ? (
          <p className="mt-4 text-sm leading-relaxed text-foreground/85">{report.overview}</p>
        ) : null}
        <ol className="mt-5 space-y-4">
          {report.points.map((point, index) => (
            <li key={`${point.title}-${index}`}>
              <h2 className="text-base font-semibold leading-snug">
                {index + 1}. {point.title}
              </h2>
              <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
                来源：{point.source || "—"}
                {point.url ? ` · ${point.url}` : ""}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{point.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          由工作台 AI 解读生成（OpenCode Zen 免费模型）；内容为模型观点，请以原文为准。
        </p>
      </article>
    </div>
  );
}
