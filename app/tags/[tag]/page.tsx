import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PostList, type ArchiveGroup } from "@/components/post/post-list";
import { Pagination } from "@/components/post/pagination";
import { Sidebar, sidebarWidthVars } from "@/components/layout/sidebar";
import { SidebarColumn } from "@/components/layout/sidebar-column";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getSiteConfig } from "@/lib/site-config";
import { getDateCounts, getPublicPosts, groupByYear, toMeta } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type Params = Promise<{ tag: string }>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `#${decoded}`,
    description: `${site.name}中所有标注为「${decoded}」标签的文章列表，按年份归档，可快速浏览该主题下的全部内容。`,
    alternates: { canonical: `/tags/${encodeURIComponent(decoded)}` },
  };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tag } = await params;
  const { page } = await searchParams;
  const decoded = decodeURIComponent(tag);
  const all = getPublicPosts().filter((p) => p.tags.includes(decoded));
  if (all.length === 0) notFound();

  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const current = clamp(Number.parseInt(page ?? "1", 10) || 1, 1, totalPages);
  const pagePosts = all.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const groups: ArchiveGroup[] = groupByYear(pagePosts).map((group) => ({
    year: group.year,
    posts: group.posts.map(toMeta),
  }));
  const dates = getDateCounts(getPublicPosts());
  const { sidebar, sidebarWidth } = getSiteConfig();
  const latest = all[0]?.date?.slice(0, 10) ?? "";

  return (
    <div
      className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_var(--sb-right)] xl:grid-cols-[var(--sb-left)_minmax(0,1fr)_var(--sb-right)]"
      style={sidebarWidthVars(sidebarWidth)}
    >
      <SidebarColumn side="left">
        <Sidebar items={sidebar.list.left} dates={dates} />
      </SidebarColumn>
      <Panel className="min-w-0">
        <PageHeader
          title={<><span className="text-tag">#</span>{decoded}</>}
          meta={`共 ${all.length} 篇${latest ? ` · 最近更新 ${latest}` : ""}`}
          action={
            <Link href="/tags" className="text-xs text-muted-foreground transition-colors hover:text-primary">
              所有标签 →
            </Link>
          }
          className="mb-6"
        />
        <PostList groups={groups} variant="catalog" />
        <Pagination
          basePath={`/tags/${encodeURIComponent(decoded)}`}
          current={current}
          total={totalPages}
        />
      </Panel>
      <SidebarColumn side="right">
        <Sidebar items={sidebar.list.right} dates={dates} />
      </SidebarColumn>
    </div>
  );
}
