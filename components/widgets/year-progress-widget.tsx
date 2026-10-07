import { yearProgress } from "@/lib/year-progress";
import { WidgetHeading } from "./widget-heading";

/** 趣味：今年进度条（按 UTC，各时区一致） */
export function YearProgressWidget() {
  const { year, pct, dayOfYear, totalDays } = yearProgress();

  return (
    <section aria-label="今年进度">
      <WidgetHeading>{year} 年进度</WidgetHeading>
      <div className="h-2 w-full overflow-hidden rounded-full border border-border/60 bg-surface">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 shadow-[0_0_12px_rgba(224,122,82,0.35)]"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          第 {dayOfYear} / {totalDays} 天
        </span>
        <span className="tabular-nums">{pct.toFixed(1)}%</span>
      </p>
    </section>
  );
}
