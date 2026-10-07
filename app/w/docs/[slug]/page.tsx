import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleContent } from "@/components/post/article-content";
import { getSiteConfig } from "@/lib/site-config";
import { FloatingToc } from "@/components/post/floating-toc";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { readDoc } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown/render";
import { formatClock } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;


export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const doc = readDoc(decodeURIComponent(slug));
  return { title: doc ? `${doc.title} · 文档` : "文档" };
}

export default async function DocPage({ params }: { params: Params }) {
  const session = await getServerSession();
  const { slug } = await params;
  const name = decodeURIComponent(slug);
  if (!session) redirect(`/login?next=/w/docs/${encodeURIComponent(name)}`);

  const doc = readDoc(name);
  if (!doc) notFound();

  const { html, toc } = await renderMarkdown(doc.markdown);

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8">
      <BackToWorkbench />
      <article className="glass mt-3 min-w-0 rounded-2xl p-6 sm:p-9">
        <h1 className="font-heading text-[24px] font-bold leading-snug sm:text-[30px]">{doc.title}</h1>
        <p className="mt-2 mb-8 font-mono text-xs text-muted-foreground">
          {name}.md · 更新于 {formatClock(doc.updatedAt)}
        </p>
        <ArticleContent html={html} collapseLines={getSiteConfig().codeCollapseLines} />
      </article>
      <FloatingToc toc={toc} />
    </div>
  );
}
