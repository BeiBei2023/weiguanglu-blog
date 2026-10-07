"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, FileText, Pencil, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export interface AdminPostRow {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  visibility: string;
  views: number;
}

const VIS: Record<string, { label: string; dot: string }> = {
  public: { label: "公开", dot: "border border-emerald-500 bg-emerald-500" },
  login: { label: "登录可见", dot: "border border-amber-500 bg-transparent" },
  draft: { label: "草稿", dot: "border border-dashed border-muted-foreground/70 bg-transparent" },
};

type FilterKey = "all" | "public" | "login" | "draft";
type SortKey = "date" | "views";

export function PostTable({ posts }: { posts: AdminPostRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const counts = useMemo(
    () => ({
      all: posts.length,
      public: posts.filter((p) => p.visibility === "public").length,
      login: posts.filter((p) => p.visibility === "login").length,
      draft: posts.filter((p) => p.visibility === "draft").length,
    }),
    [posts],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter((post) => {
        if (filter !== "all" && post.visibility !== filter) return false;
        if (!q) return true;
        return (
          post.title.toLowerCase().includes(q) ||
          post.slug.includes(q) ||
          post.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const cmp =
          sortKey === "date" ? (a.date || "").localeCompare(b.date || "") : a.views - b.views;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [posts, query, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "全部", count: counts.all },
    { key: "public", label: "公开", count: counts.public },
    { key: "login", label: "登录可见", count: counts.login },
    { key: "draft", label: "草稿", count: counts.draft },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === item.key
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {item.label} <span className="tabular-nums opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题 / slug / 标签"
              aria-label="搜索文章"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => toggleSort("date")}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            title="按日期排序"
          >
            日期
            {sortKey === "date" ? (
              sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => toggleSort("views")}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            title="按阅读量排序"
          >
            阅读
            {sortKey === "views" ? (
              sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            ) : null}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {rows.map((post) => {
          const vis = VIS[post.visibility] ?? VIS.draft;
          return (
            <li key={post.slug} className="group relative">
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
              />
              <div className="flex items-baseline gap-3 py-3.5 pl-3">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/edit/${post.slug}`}
                    className="block truncate text-[15.5px] font-medium leading-snug transition-colors group-hover:text-primary"
                  >
                    {post.title}
                  </Link>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", vis.dot)} aria-hidden />
                      {vis.label}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{post.slug}</span>
                    {post.tags.length > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{post.tags.join(" / ")}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <time className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                  {post.date || "—"}
                </time>
                <span className="w-14 shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground">
                  {post.views}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/admin/edit/${post.slug}`}
                    aria-label="编辑"
                    title="编辑"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`/posts/${post.slug}`}
                    aria-label={post.visibility === "draft" ? "预览" : "查看"}
                    title={post.visibility === "draft" ? "预览（草稿）" : "查看"}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={posts.length === 0 ? "还没有文章" : "没有匹配的文章"}
          description={
            posts.length === 0 ? "点右上角「新建文章」写下第一篇。" : "换个关键词，或把筛选切回「全部」。"
          }
        />
      ) : null}
    </div>
  );
}
