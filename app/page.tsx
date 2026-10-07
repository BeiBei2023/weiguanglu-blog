import Link from "next/link";
import type { Metadata } from "next";
import { PostList, type ArchiveGroup } from "@/components/post/post-list";
import { Pagination } from "@/components/post/pagination";
import { Sidebar, sidebarWidthVars } from "@/components/layout/sidebar";
import { SidebarColumn } from "@/components/layout/sidebar-column";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getSiteConfig } from "@/lib/site-config";
import { getServerSession } from "@/lib/auth/server";
import { getDateCounts, getReadingPosts, groupByYear, toMeta } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const homeDescription = site.slogan
  ? `${site.name}（${site.slogan}）：一个分享技术折腾与日常笔记的个人博客，首页汇总最近更新的文章，可按标签与归档浏览全部内容。`
  : `${site.name}是一个分享技术折腾与日常笔记的个人博客，首页汇总最近更新的文章，可按标签与归档浏览全部内容。`;

export const metadata: Metadata = {
  title: { absolute: site.slogan ? `${site.name} · ${site.slogan}` : site.name },
  description: homeDescription,
  alternates: { canonical: "/" },
};

const PAGE_SIZE = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getServerSession();
  const { page } = await searchParams;
  const posts = getReadingPosts(Boolean(session));
  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const current = clamp(Number.parseInt(page ?? "1", 10) || 1, 1, totalPages);
  const pagePosts = posts.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const groups: ArchiveGroup[] = groupByYear(pagePosts).map((group) => ({
    year: group.year,
    posts: group.posts.map(toMeta),
  }));
  const dates = getDateCounts(posts);
  const { sidebar, sidebarWidth } = getSiteConfig();

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
          title="最近更新"
          titleClassName="text-lg"
          action={
            <Link
              href="/archive"
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              全部档案 →
            </Link>
          }
          className="mb-5"
        />
        <PostList groups={groups} variant="reading" />
        <Pagination basePath="/" current={current} total={totalPages} />
      </Panel>
      <SidebarColumn side="right">
        <Sidebar items={sidebar.list.right} dates={dates} />
      </SidebarColumn>
    </div>
  );
}
