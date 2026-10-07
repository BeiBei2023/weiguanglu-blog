import type { ComponentType } from "react";
import type { TocItem } from "@/lib/markdown/render";
import { TocWidget } from "@/components/widgets/toc-widget";
import { CalendarWidget } from "@/components/widgets/calendar-widget";
import { SiteStatsWidget } from "@/components/widgets/site-stats-widget";
import { HotPostsWidget } from "@/components/widgets/hot-posts-widget";
import { TagCloudWidget } from "@/components/widgets/tag-cloud-widget";
import { HitokotoWidget } from "@/components/widgets/hitokoto-widget";
import { GithubCardWidget } from "@/components/widgets/github-card-widget";
import { YearProgressWidget } from "@/components/widgets/year-progress-widget";
import { WeatherWidget } from "@/components/widgets/weather-widget";

export interface WidgetProps {
  toc?: TocItem[];
  /** 日期 → 文章数（供日历挂件使用） */
  dates?: Record<string, number>;
  /** 归档页传入正在浏览的年月（"YYYY-MM"/"YYYY-MM-DD"），供日历定位初始月 */
  initialMonth?: string;
}

export interface WidgetDef {
  id: string;
  component: ComponentType<WidgetProps>;
}

/**
 * 挂件实现表：id → 组件。目录/默认布局在 `lib/widgets/catalog.ts`，
 * 实际启用的挂件与左右顺序来自站点设置（`getSiteConfig().sidebar`）。
 * 加一个挂件 = 写组件文件 + catalog 加一行 + 这里加一行。
 */
const WIDGETS: Record<string, WidgetDef> = {
  toc: { id: "toc", component: TocWidget },
  calendar: { id: "calendar", component: CalendarWidget },
  stats: { id: "stats", component: SiteStatsWidget },
  hot: { id: "hot", component: HotPostsWidget },
  tagcloud: { id: "tagcloud", component: TagCloudWidget },
  hitokoto: { id: "hitokoto", component: HitokotoWidget },
  github: { id: "github", component: GithubCardWidget },
  progress: { id: "progress", component: YearProgressWidget },
  weather: { id: "weather", component: WeatherWidget },
};

export function resolveWidgets(ids: string[]): WidgetDef[] {
  return ids.map((id) => WIDGETS[id]).filter(Boolean);
}
