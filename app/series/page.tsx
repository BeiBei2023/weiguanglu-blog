import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getPublicPosts, listSeries } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "系列",
  description: `按系列或专栏把${site.name}的长文串成合集，每个系列内的文章按顺序排列，方便从头到尾连续阅读。`,
  alternates: { canonical: "/series" },
};

export default function SeriesPage() {
  const series = listSeries(getPublicPosts());

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8">
      <Panel>
        <PageHeader
          title="系列"
          icon={BookOpen}
          meta={`共 ${series.length} 个系列 · 把相关文章串成一条线，按顺序读更像一本书`}
          action={
            <Link href="/archive" className="text-xs text-muted-foreground transition-colors hover:text-primary">
              全部文章 →
            </Link>
          }
          className="mb-4"
        />

        {series.length === 0 ? (
          <EmptyState
            className="py-20"
            icon={BookOpen}
            title="还没有系列"
            description="在文章的 frontmatter 里加一行 series: 系列名，就会出现在这里。"
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {series.map((item) => (
              <li key={item.name}>
                <Link href={`/series/${encodeURIComponent(item.name)}`} className="group block py-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-heading text-[16.5px] font-medium leading-snug transition-colors group-hover:text-primary">
                      {item.name}
                    </h2>
                    <span className="text-[12px] tabular-nums text-muted-foreground">{item.count} 篇</span>
                    <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                      最近 {item.latest}
                    </span>
                  </div>
                  <ol className="mt-2 space-y-1 text-[13.5px] text-muted-foreground">
                    {item.posts.slice(0, 3).map((post, index) => (
                      <li key={post.slug} className="flex gap-2">
                        <span className="w-4 shrink-0 text-right text-[11.5px] leading-6 tabular-nums text-muted-foreground/70">
                          {index + 1}
                        </span>
                        <span className="truncate">{post.title}</span>
                      </li>
                    ))}
                    {item.count > 3 ? (
                      <li className="pl-6 text-[12px] text-muted-foreground/70">
                        …还有 {item.count - 3} 篇
                      </li>
                    ) : null}
                  </ol>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
