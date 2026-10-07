import Link from "next/link";
import { PostList, type ArchiveGroup } from "@/components/post/post-list";
import { Sidebar, sidebarWidthVars } from "@/components/layout/sidebar";
import { SidebarColumn } from "@/components/layout/sidebar-column";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getSiteConfig } from "@/lib/site-config";
import { getServerSession } from "@/lib/auth/server";
import { getDateCounts, getReadingPosts, groupByYear, toMeta } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "归档",
  description: `按时间浏览${site.name}的全部文章归档，按年份与月份汇总，从最早到最近一览所有已发布内容。`,
  alternates: { canonical: "/archive" },
};

export default async function ArchivePage() {
  const session = await getServerSession();
  const posts = getReadingPosts(Boolean(session));
  const groups: ArchiveGroup[] = groupByYear(posts).map((group) => ({
    year: group.year,
    posts: group.posts.map(toMeta),
  }));
  const dates = getDateCounts(posts);
  const { sidebar, sidebarWidth } = getSiteConfig();
  const first = posts.at(-1)?.date ?? "";
  const latest = posts[0]?.date ?? "";

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
          title="归档"
          meta={`共 ${posts.length} 篇${first ? ` · 自 ${first.slice(0, 7)} 起` : ""}${latest ? ` · 最近更新 ${latest.slice(0, 10)}` : ""}`}
          action={
            <Link href="/tags" className="text-xs text-muted-foreground transition-colors hover:text-primary">
              全部标签 →
            </Link>
          }
          className="mb-6"
        />
        <PostList groups={groups} variant="catalog" />
      </Panel>
      <SidebarColumn side="right">
        <Sidebar items={sidebar.list.right} dates={dates} />
      </SidebarColumn>
    </div>
  );
}
