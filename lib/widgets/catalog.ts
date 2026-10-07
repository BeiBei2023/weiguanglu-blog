/**
 * 挂件目录与侧栏布局（纯数据，客户端/服务端通用——勿在此引入服务端依赖）。
 */
export interface WidgetMeta {
  id: string;
  label: string;
}

/** 可用挂件目录 */
export const WIDGET_CATALOG: WidgetMeta[] = [
  { id: "toc", label: "目录" },
  { id: "stats", label: "站点统计" },
  { id: "calendar", label: "日历" },
  { id: "hot", label: "热门文章" },
  { id: "tagcloud", label: "标签云" },
  { id: "hitokoto", label: "一言" },
  { id: "github", label: "GitHub" },
  { id: "progress", label: "年进度" },
  { id: "weather", label: "天气" },
];

export const WIDGET_IDS: string[] = WIDGET_CATALOG.map((w) => w.id);

export interface SidebarLayout {
  left: string[];
  right: string[];
}

export interface SidebarConfig {
  /** 文章页 */
  post: SidebarLayout;
  /** 列表 / 标签 / 归档页 */
  list: SidebarLayout;
}

export const DEFAULT_SIDEBAR: SidebarConfig = {
  post: { left: ["toc"], right: ["hot", "hitokoto"] },
  list: {
    left: ["stats", "hot", "tagcloud"],
    right: ["calendar", "hitokoto", "github", "progress"],
  },
};

/** 校验单个布局：只保留已知且不重复的挂件 id；两侧都缺省则回退默认 */
export function sanitizeLayout(input: unknown, fallback: SidebarLayout): SidebarLayout {
  if (!input || typeof input !== "object") {
    return { left: [...fallback.left], right: [...fallback.right] };
  }
  const src = input as { left?: unknown; right?: unknown };
  if (src.left === undefined && src.right === undefined) {
    return { left: [...fallback.left], right: [...fallback.right] };
  }
  const seen = new Set<string>();
  const take = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const value of arr) {
      if (typeof value !== "string" || seen.has(value) || !WIDGET_IDS.includes(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  };
  return { left: take(src.left), right: take(src.right) };
}

export function sanitizeSidebar(input: unknown, fallback: SidebarConfig = DEFAULT_SIDEBAR): SidebarConfig {
  const src = (input && typeof input === "object" ? input : {}) as { post?: unknown; list?: unknown };
  return {
    post: sanitizeLayout(src.post, fallback.post),
    list: sanitizeLayout(src.list, fallback.list),
  };
}

export interface SidebarWidth {
  left: number;
  right: number;
}

export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 400;

export const DEFAULT_SIDEBAR_WIDTH: SidebarWidth = { left: 240, right: 260 };

function clampWidth(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, n));
}

export function sanitizeSidebarWidth(
  input: unknown,
  fallback: SidebarWidth = DEFAULT_SIDEBAR_WIDTH,
): SidebarWidth {
  const src = (input && typeof input === "object" ? input : {}) as { left?: unknown; right?: unknown };
  return {
    left: clampWidth(src.left, fallback.left),
    right: clampWidth(src.right, fallback.right),
  };
}
