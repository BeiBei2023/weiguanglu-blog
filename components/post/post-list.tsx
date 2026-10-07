import Link from "next/link";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import type { PostMeta } from "@/lib/content/types";

export interface ArchiveGroup {
  year: string;
  posts: PostMeta[];
}

export function PostList({
  groups,
  variant = "default",
}: {
  groups: ArchiveGroup[];
  variant?: "default" | "reading" | "catalog";
}) {
  const reading = variant === "reading";
  const catalog = variant === "catalog";
  const flat = groups.flatMap((group) => group.posts.map((post) => ({ ...post, year: group.year })));
  const items = flat.map((post, i) => ({
    post,
    showYear: i === 0 || flat[i - 1].year !== post.year,
  }));
  const yearCounts = new Map<string, number>();
  for (const entry of flat) {
    yearCounts.set(entry.year, (yearCounts.get(entry.year) ?? 0) + 1);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="这里还没有文章"
        description="等第一篇文章发布，这里就会出现。"
      />
    );
  }

  return (
    <div>
      {items.map(({ post, showYear }, i) => (
        <div key={post.slug}>
          {showYear &&
            (catalog ? (
              <h2
                className={`mb-1 flex items-center gap-3 font-heading text-[11.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80 ${
                  i > 0 ? "mt-8" : ""
                }`}
              >
                {post.year}
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="tabular-nums text-muted-foreground/70">
                  {yearCounts.get(post.year) ?? 0} 篇
                </span>
              </h2>
            ) : (
              <h2
                className={`mb-2 flex items-center gap-3 font-heading text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 ${
                  i > 0 ? "mt-10" : ""
                }`}
              >
                {post.year}
                <span className="h-px flex-1 bg-border" aria-hidden />
              </h2>
            ))}
          {catalog ? (
            <ListRow
              className="border-b border-border/60"
              title={
                <Link
                  href={`/posts/${post.slug}`}
                  className="font-heading text-[16.5px] font-medium leading-snug transition-colors group-hover:text-primary"
                >
                  {post.title}
                </Link>
              }
              trailing={
                <time className="text-[12.5px] tabular-nums text-muted-foreground">{post.date}</time>
              }
            />
          ) : (
            <ListRow
              className="border-b border-border/60"
              title={
                <Link
                  href={`/posts/${post.slug}`}
                  className="font-heading text-[17.5px] font-semibold leading-snug transition-colors group-hover:text-primary"
                >
                  {reading && i === 0 ? (
                    <span
                      className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary align-middle"
                      aria-hidden
                    />
                  ) : null}
                  {post.title}
                </Link>
              }
              trailing={
                <time className="text-[13.5px] tabular-nums text-muted-foreground">
                  {post.date.slice(5)}
                </time>
              }
              meta={
                post.tags.length > 0
                  ? post.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/tags/${encodeURIComponent(tag)}`}
                        className="rounded-full border border-border/80 px-2 py-0.5 text-[12px] text-muted-foreground transition-colors hover:border-tag/60 hover:text-tag"
                      >
                        {tag}
                      </Link>
                    ))
                  : undefined
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
