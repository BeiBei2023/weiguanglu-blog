import { getPublicPosts, getTagCounts } from "@/lib/content";
import { getAllViews } from "@/lib/views";
import { siteAgeDays } from "@/lib/site-age";
import { WidgetHeading } from "./widget-heading";

export function SiteStatsWidget() {
  const totalViews = Object.values(getAllViews()).reduce((sum, n) => sum + n, 0);
  const ageDays = siteAgeDays();
  const items = [
    { label: "文章", value: String(getPublicPosts().length) },
    { label: "标签", value: String(getTagCounts().length) },
    { label: "总阅读", value: String(totalViews) },
    ...(ageDays === null ? [] : [{ label: "建站", value: `${ageDays} 天` }]),
  ];

  return (
    <section aria-label="站点统计">
      <WidgetHeading>站点统计</WidgetHeading>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/50 bg-surface px-3 py-2 transition-colors hover:border-primary/30"
          >
            <p className="text-base font-semibold leading-tight tabular-nums">{item.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
