import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, FileText } from "lucide-react";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { listDocs } from "@/lib/docs";
import { formatBytes, formatClock } from "@/lib/format";

export const metadata: Metadata = { title: "项目文档" };
export const dynamic = "force-dynamic";



export default async function DocsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/docs");

  const docs = listDocs();

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <BookOpen className="h-5 w-5 text-primary" />
          项目文档
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          仓库 <span className="font-mono">文档/</span> 下的 Markdown：设计取舍、施工计划、部署与各模块手册，手机上也能翻。
        </p>
      </header>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="w-band wgl-cells">
          <div className="w-band-cell">
            <span className="band-label">文档</span>
            <span className="band-value">{docs.length}</span>
            <span className="band-hint">篇 Markdown</span>
          </div>
          <div className="w-band-cell">
            <span className="band-label">合计</span>
            <span className="band-value">{formatBytes(docs.reduce((sum, doc) => sum + doc.bytes, 0))}</span>
            <span className="band-hint">仓库 文档/</span>
          </div>
          {docs.length > 0 ? (
            <div className="w-band-cell">
              <span className="band-label">最近改动</span>
              <span className="band-value">{formatClock(docs[0].updatedAt)}</span>
              <span className="band-hint">{docs[0].title}</span>
            </div>
          ) : null}
        </div>
      </div>

      {docs.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          文档目录里还没有 Markdown 文件。
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={`/w/docs/${encodeURIComponent(doc.slug)}`}
                className="group flex items-center gap-3 border-b border-border/60 py-3.5 transition-colors last:border-b-0"
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16.5px] font-medium group-hover:text-primary">
                    {doc.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {doc.slug}.md · {formatBytes(doc.bytes)}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                  {formatClock(doc.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
