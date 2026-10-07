import Link from "next/link";
import { getPublicPosts } from "@/lib/content";
import { getAllViews } from "@/lib/views";
import { WidgetHeading } from "./widget-heading";

export function HotPostsWidget() {
  const views = getAllViews();
  const top = getPublicPosts()
    .map((post) => ({
      slug: post.slug,
      title: post.title,
      views: views[post.slug] ?? 0,
      date: post.date ?? "",
    }))
    .sort((a, b) => b.views - a.views || b.date.localeCompare(a.date))
    .slice(0, 5);

  if (top.length === 0) return null;

  return (
    <section aria-label="热门文章">
      <WidgetHeading>热门文章</WidgetHeading>
      <ol className="space-y-1.5 text-sm">
        {top.map((item, index) => (
          <li
            key={item.slug}
            className="group -mx-1 flex items-baseline gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/60"
          >
            <span
              className={`w-3 shrink-0 text-right text-xs tabular-nums ${
                index < 3 ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {index + 1}
            </span>
            <Link
              href={`/posts/${item.slug}`}
              className="min-w-0 flex-1 truncate text-sm text-muted-foreground transition-colors group-hover:text-foreground"
            >
              {item.title}
            </Link>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="阅读量">
              {item.views}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
