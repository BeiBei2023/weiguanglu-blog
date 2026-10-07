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

type Params = Promise<{ date: string[] }>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseSegments(
  segments: string[],
): { label: string; prefix: string; basePath: string } | null {
  if (segments.length === 0 || segments.length > 3) return null;
  const [y, m, d] = segments;
  if (!/^\d{4}$/.test(y)) return null;
  let month: string | undefined;
  let day: string | undefined;
  if (m !== undefined) {
    if (!/^\d{1,2}$/.test(m)) return null;
    month = m.padStart(2, "0");
    if (Number(month) < 1 || Number(month) > 12) return null;
  }
  if (d !== undefined) {
    if (!/^\d{1,2}$/.test(d)) return null;
    day = d.padStart(2, "0");
    if (Number(day) < 1 || Number(day) > 31) return null;
  }
  const parts = [y, month, day].filter(Boolean) as string[];
  const label = day
    ? `${y} 年 ${Number(month)} 月 ${Number(day)} 日`
    : month
      ? `${y} 年 ${Number(month)} 月`
      : `${y} 年`;
  return { label, prefix: parts.join("-"), basePath: `/archive/${parts.join("/")}` };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { date } = await params;
  const parsed = parseSegments(date ?? []);
  return {
    title: parsed ? `${parsed.label}归档` : "归档",
    description: parsed
      ? `${site.name}中${parsed.label}发布的全部文章归档，按时间倒序排列，方便回顾这段时间的所有内容。`
      : `按时间浏览${site.name}的全部文章归档，按年份与月份汇总，从最早到最近一览所有已发布内容。`,
    alternates: { canonical: parsed ? parsed.basePath : "/archive" },
  };
}

export default async function ArchivePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  const { date } = await params;
  const { page } = await searchParams;
  const parsed = parseSegments(date ?? []);
  if (!parsed) notFound();

  const all = getPublicPosts().filter((p) => p.date.startsWith(parsed.prefix));
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

  return (
    <div
      className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_var(--sb-right)] xl:grid-cols-[var(--sb-left)_minmax(0,1fr)_var(--sb-right)]"
      style={sidebarWidthVars(sidebarWidth)}
    >
      <SidebarColumn side="left">
        <Sidebar items={sidebar.list.left} dates={dates} initialMonth={parsed.prefix} />
      </SidebarColumn>
      <Panel className="min-w-0">
        <PageHeader
          title={`${parsed.label}归档`}
          meta={`共 ${all.length} 篇`}
          action={
            <Link href="/archive" className="text-xs text-muted-foreground transition-colors hover:text-primary">
              归档首页 →
            </Link>
          }
          className="mb-6"
        />
        <PostList groups={groups} variant="catalog" />
        <Pagination basePath={parsed.basePath} current={current} total={totalPages} />
      </Panel>
      <SidebarColumn side="right">
        <Sidebar
          key={parsed.prefix}
          items={sidebar.list.right}
          dates={dates}
          initialMonth={parsed.prefix}
        />
      </SidebarColumn>
    </div>
  );
}
