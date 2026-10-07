import Link from "next/link";
import { BookOpen } from "lucide-react";
import { cn } from "cn";

export interface SeriesRailPost {
  slug: string;
  title: string;
}

/**
 * 「档案柜」方向的左侧系列轴轨：
 * 一条竖线 + 进度点（读完的实心灰 / 当前橙 + 光圈 / 未读空心），底部给下一站。
 */
export function SeriesRail({
  name,
  posts,
  currentIndex,
  next,
}: {
  name: string;
  posts: SeriesRailPost[];
  currentIndex: number;
  next: SeriesRailPost | null;
}) {
  return (
    <aside className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 shrink-0 text-primary" />
        <Link
          href={`/series/${encodeURIComponent(name)}`}
          className="font-heading text-sm font-semibold transition-colors hover:text-primary"
        >
          {name}
        </Link>
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
        共 {posts.length} 篇
        {currentIndex >= 0 ? ` · 你在这里读第 ${currentIndex + 1} 篇` : ""}
      </p>

      <ol className="relative mt-4 border-l border-border/60">
        {posts.map((item, index) => {
          const state = item.slug === posts[currentIndex]?.slug ? "on" : index < currentIndex ? "done" : "todo";
          return (
            <li key={item.slug} className="relative pl-4">
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[5px] top-[0.85em] size-2.5 rounded-full border",
                  state === "on" && "border-primary bg-primary ring-4 ring-primary/20",
                  state === "done" && "border-muted-foreground bg-muted-foreground",
                  state === "todo" && "border-border bg-background",
                )}
              />
              {state === "on" ? (
                <span className="block py-1.5 text-[13.5px] font-semibold leading-snug text-primary">
                  {item.title}
                </span>
              ) : (
                <Link
                  href={`/posts/${item.slug}`}
                  className="block py-1.5 text-[13.5px] leading-snug text-muted-foreground transition-colors hover:text-primary"
                >
                  {item.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {next && (
        <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          读完了？下一站：
          <Link href={`/posts/${next.slug}`} className="text-primary hover:underline">
            {next.title}
          </Link>
        </p>
      )}
    </aside>
  );
}
