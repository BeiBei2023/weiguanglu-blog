import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { PostTable, type AdminPostRow } from "@/components/admin/post-table";
import { Button } from "@/components/ui/button";
import { getAllPosts } from "@/lib/content";
import { getAllViews } from "@/lib/views";

export const metadata = { title: "文章列表" };
export const dynamic = "force-dynamic";

export default function AdminPage() {
  const views = getAllViews();
  const rows: AdminPostRow[] = getAllPosts().map((post) => ({
    slug: post.slug,
    title: post.title,
    date: post.date ?? "",
    tags: post.tags,
    visibility: post.visibility,
    views: views[post.slug] ?? 0,
  }));
  const totalViews = rows.reduce((sum, row) => sum + row.views, 0);
  const publicCount = rows.filter((row) => row.visibility === "public").length;
  const draftCount = rows.filter((row) => row.visibility === "draft").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-[26px] font-semibold tracking-[-0.3px]">
            <FileText className="h-5 w-5 text-primary" />
            文章
          </h1>
          <p className="mt-1 text-[12.5px] tabular-nums text-muted-foreground">
            共 {rows.length} 篇 · 公开 {publicCount} · 草稿 {draftCount} · 总阅读 {totalViews}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/archive"
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            全部档案 →
          </Link>
          <Button asChild size="sm">
            <Link href="/admin/new">
              <Plus className="h-4 w-4" />
              新建文章
            </Link>
          </Button>
        </div>
      </header>
      <PostTable posts={rows} />
    </div>
  );
}
