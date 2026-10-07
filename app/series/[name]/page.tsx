import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getPublicPosts, getSeriesPosts } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

type Params = Promise<{ name: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  return {
    title: `系列：${decoded}`,
    description: `${site.name}的「${decoded}」系列文章列表，按系列顺序排列，方便按顺序从头到尾连续阅读该系列的全部文章。`,
    alternates: { canonical: `/series/${encodeURIComponent(decoded)}` },
  };
}

export default async function SeriesDetailPage({ params }: { params: Params }) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const posts = getSeriesPosts(decoded, getPublicPosts());
  if (posts.length === 0) notFound();

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8">
      <Panel>
        <PageHeader
          title={decoded}
          icon={BookOpen}
          meta={`共 ${posts.length} 篇 · 按系列顺序排列`}
          action={
            <Link href="/series" className="text-xs text-muted-foreground transition-colors hover:text-primary">
              全部系列 →
            </Link>
          }
          className="mb-4"
        />

        <ol className="divide-y divide-border/60">
          {posts.map((post, index) => (
            <li key={post.slug}>
              <Link href={`/posts/${post.slug}`} className="group flex gap-4 py-4">
                <span className="mt-0.5 w-5 shrink-0 text-right text-[12px] font-medium tabular-nums text-muted-foreground/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-heading text-[16.5px] font-medium leading-snug transition-colors group-hover:text-primary">
                      {post.title}
                    </span>
                    <span className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
                      {post.date}
                    </span>
                  </span>
                  {post.description ? (
                    <span className="mt-1.5 line-clamp-2 block text-[13.5px] leading-relaxed text-muted-foreground">
                      {post.description}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
