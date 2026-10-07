import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SIDEBAR,
  DEFAULT_SIDEBAR_WIDTH,
  sanitizeSidebar,
  sanitizeSidebarWidth,
  type SidebarConfig,
  type SidebarWidth,
} from "./widgets/catalog";
import { festivalById } from "./festival";

// 站点设置放在 data/（gitignore、volume 持久化），避免 push 时被 git checkout 冲掉
const FILE = path.join(process.cwd(), "data", "site.json");

export interface SiteConfig {
  /** 头像（关于页/侧栏） */
  avatar: string;
  /** 站点头图（导航左侧，暗色主题） */
  logo: string;
  /** 站点头图（导航左侧，亮色主题） */
  logoLight: string;
  /** 站点图标 favicon（亮色/默认） */
  favicon: string;
  /** 站点图标 favicon（暗色） */
  faviconDark: string;
  /** 网站背景照片（留空则无背景；设了视频时作为视频封面/降级） */
  background: string;
  /** 网站背景视频（mp4/webm 短循环；留空则只用背景照片） */
  backgroundVideo: string;
  /** 背景遮罩不透明度 0–100：越小背景图越清晰，越大越淡，默认 65 */
  backgroundDim: number;
  /** 背景模糊半径 0–40px：模糊背景图以降噪、提升可读性，默认 12 */
  backgroundBlur: number;
  /** 面板风格：dark=深色玻璃(浅色字)，light=浅色磨砂(黑字) */
  panelStyle: "dark" | "light";
  /** 图片防盗链：off=不限制；relaxed=有外站 Referer 才拦（推荐）；strict=必须本站 Referer */
  imageHotlink: "off" | "relaxed" | "strict";
  /** 侧栏挂件布局（左右列与顺序，可在后台设置里调） */
  sidebar: SidebarConfig;
  /** 侧栏左右两列宽度（px，可在后台设置里调） */
  sidebarWidth: SidebarWidth;
  /** 文章代码块超过多少行时默认折叠（0 = 不折叠） */
  codeCollapseLines: number;
  /** 节日氛围：auto=按日期自动识别；off=关闭；其它值=指定节日 id（预览用） */
  festival: string;
}

const DEFAULTS: SiteConfig = {
  avatar: "/avatar.jpg",
  logo: "/logo-dark.png",
  logoLight: "/logo-light.png",
  favicon: "/favicon-light.png",
  faviconDark: "/favicon-dark.png",
  background: "",
  backgroundVideo: "",
  backgroundDim: 65,
  backgroundBlur: 12,
  panelStyle: "dark",
  imageHotlink: "relaxed",
  sidebar: DEFAULT_SIDEBAR,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  codeCollapseLines: 20,
  festival: "auto",
};

function clampDim(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.backgroundDim;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampBlur(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.backgroundBlur;
  return Math.min(40, Math.max(0, Math.round(n)));
}

/** 代码块折叠阈值：0–200 行（0 = 不折叠） */
function clampCollapseLines(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.codeCollapseLines;
  return Math.min(200, Math.max(0, Math.round(n)));
}

/** 节日氛围：auto / off / 指定节日 id（未知 id 一律回 auto） */
function sanitizeFestival(value: unknown): string {
  if (typeof value !== "string") return DEFAULTS.festival;
  const v = value.trim();
  if (v === "auto" || v === "off") return v;
  return festivalById(v) ? v : DEFAULTS.festival;
}

function signature(): string {
  try {
    return String(fs.statSync(FILE).mtimeMs);
  } catch {
    return "none";
  }
}

let cache: { signature: string; value: SiteConfig } | null = null;

export function invalidateSiteConfigCache(): void {
  cache = null;
}

export function getSiteConfig(): SiteConfig {
  const sig = signature();
  if (cache && cache.signature === sig) return cache.value;

  let value: SiteConfig = { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<SiteConfig>;
    value = {
      ...DEFAULTS,
      ...raw,
      backgroundDim: clampDim(raw.backgroundDim ?? DEFAULTS.backgroundDim),
      backgroundBlur: clampBlur(raw.backgroundBlur ?? DEFAULTS.backgroundBlur),
      codeCollapseLines: clampCollapseLines(raw.codeCollapseLines ?? DEFAULTS.codeCollapseLines),
      festival: sanitizeFestival(raw.festival ?? DEFAULTS.festival),
      panelStyle: raw.panelStyle === "light" ? "light" : "dark",
      imageHotlink:
        raw.imageHotlink === "off" || raw.imageHotlink === "strict" ? raw.imageHotlink : "relaxed",
      sidebar: sanitizeSidebar(raw.sidebar, DEFAULT_SIDEBAR),
      sidebarWidth: sanitizeSidebarWidth(raw.sidebarWidth, DEFAULT_SIDEBAR_WIDTH),
    };
  } catch {
    // 文件缺失或格式错误时用默认值
  }
  cache = { signature: sig, value };
  return value;
}

export function saveSiteConfig(input: Partial<SiteConfig>): SiteConfig {
  const current = getSiteConfig();
  const next: SiteConfig = {
    ...current,
    ...input,
    backgroundDim: clampDim(input.backgroundDim ?? current.backgroundDim),
    backgroundBlur: clampBlur(input.backgroundBlur ?? current.backgroundBlur),
    codeCollapseLines: clampCollapseLines(input.codeCollapseLines ?? current.codeCollapseLines),
    festival: sanitizeFestival(input.festival ?? current.festival),
    panelStyle:
      input.panelStyle === "light" || input.panelStyle === "dark"
        ? input.panelStyle
        : current.panelStyle,
    imageHotlink:
      input.imageHotlink === "off" || input.imageHotlink === "relaxed" || input.imageHotlink === "strict"
        ? input.imageHotlink
        : current.imageHotlink,
    sidebar: input.sidebar ? sanitizeSidebar(input.sidebar, current.sidebar) : current.sidebar,
    sidebarWidth: input.sidebarWidth
      ? sanitizeSidebarWidth(input.sidebarWidth, current.sidebarWidth)
      : current.sidebarWidth,
  };
  const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, FILE);
  invalidateSiteConfigCache();
  return next;
}
