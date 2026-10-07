import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { formatAgo } from "./format";
import { site } from "./site";

/**
 * 热点信息聚合（工作台自用）
 *
 * 四个源（中文为主）：
 * - 掘金：**各分类热榜**（GET，前端 / 后端 / iOS / 人工智能）
 * - IT之家：科技数码 RSS
 * - 少数派：效率 / 软件 RSS
 * - GitHub：近 7 天新星（官方 Search API）
 *
 * 原则（与立创那套一致）：只用公开接口、1 小时 TTL 缓存、带 UA、
 * 任何一路失败都不影响其它路（错误挂在对应 source 上，保留上次结果）。
 */

const FILE = path.join(process.cwd(), "data", "hot.json");
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 12000;
const UA = `${site.url.replace(/^https?:\/\//, "")}-workstation/1.0 (+${site.url})`;
const LIMIT = 25;
const GITHUB_LIMIT = 30;

export interface HotItem {
  /** 稳定 id（同一条链接刷新前后不变；详情页与 AI 解说缓存都靠它） */
  id: string;
  title: string;
  url: string;
  meta: string;
  /** 原文摘要（有就带上，详情页/ AI 解说会用到） */
  summary?: string;
}

export interface HotSource {
  id: string;
  name: string;
  home: string;
  items: HotItem[];
  error?: string;
}

export interface HotData {
  fetchedAt: string;
  sources: HotSource[];
}

const META: Record<string, { name: string; home: string }> = {
  juejin: { name: "掘金 · 中文技术", home: "https://juejin.cn/" },
  ithome: { name: "IT之家 · 科技数码", home: "https://www.ithome.com/" },
  sspai: { name: "少数派 · 效率软件", home: "https://sspai.com/" },
  github: { name: "GitHub 新星", home: "https://github.com/trending" },
};

/** 条目稳定 id：同一个链接刷新前后不变 */
export function hotItemId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function withId(item: Omit<HotItem, "id">): HotItem {
  return { id: hotItemId(item.url || item.title), ...item };
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function pickTag(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return match ? decodeEntities(match[1]) : "";
}

function pickLink(block: string): string {
  const withHref = /<link[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block);
  return withHref ? withHref[1].trim() : pickTag(block, "link");
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 极简 RSS / Atom 解析：feed 都是机器生成的，正则够用；
 * 哪天遇到怪 feed 再换 `fast-xml-parser`。
 */
function parseFeed(xml: string, limit: number): HotItem[] {
  const blocks = Array.from(
    xml.matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi),
    (match) => match[0],
  );
  const items: HotItem[] = [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    const url = pickLink(block);
    if (!title || !url) continue;
    const date = pickTag(block, "pubDate") || pickTag(block, "published") || pickTag(block, "updated");
    const stamp = date ? new Date(date) : null;
    const summary = plainText(
      pickTag(block, "description") || pickTag(block, "summary") || pickTag(block, "content"),
    ).slice(0, 300);
    items.push(
      withId({
        title,
        url,
        meta: stamp && !Number.isNaN(stamp.getTime()) ? formatAgo(stamp.toISOString()) : "",
        summary,
      }),
    );
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * 掘金：按分类取热榜。
 * 实测能取到数据的分类就这四个（Android / 开发工具 / 代码人生 / 阅读 返回空列表）。
 */
const JUEJIN_CATEGORIES: { id: string; name: string }[] = [
  { id: "6809637767543259144", name: "前端" },
  { id: "6809637769959178254", name: "后端" },
  { id: "6809637773935378440", name: "iOS" },
  { id: "6809637776263217160", name: "人工智能" },
];
const JUEJIN_PER_CATEGORY = 12;

async function fetchJuejinCategory(categoryId: string, categoryName: string): Promise<HotItem[]> {
  const response = await fetch(
    `https://api.juejin.cn/content_api/v1/content/article_rank?category_id=${categoryId}&type=hot`,
    {
      headers: { "user-agent": UA, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as {
    data?: {
      content?: { content_id?: string; title?: string; brief?: string };
      content_counter?: { view?: number; like?: number };
      author?: { name?: string };
    }[];
  };

  return (data.data ?? [])
    .filter((entry) => Boolean(entry.content?.content_id && entry.content?.title))
    .slice(0, JUEJIN_PER_CATEGORY)
    .map((entry) =>
      withId({
        title: entry.content?.title ?? "(无标题)",
        url: `https://juejin.cn/post/${entry.content?.content_id ?? ""}`,
        summary: (entry.content?.brief ?? "").trim().slice(0, 300),
        meta: [
          categoryName,
          entry.author?.name,
          `${entry.content_counter?.view ?? 0} 阅读`,
          `${entry.content_counter?.like ?? 0} 赞`,
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    );
}

/** 掘金：四个分类并发取，任一分类失败不影响其它分类 */
async function fetchJuejin(): Promise<HotItem[]> {
  const groups = await Promise.all(
    JUEJIN_CATEGORIES.map(async (category) => {
      try {
        return await fetchJuejinCategory(category.id, category.name);
      } catch {
        return [] as HotItem[];
      }
    }),
  );
  const items = groups.flat();
  if (items.length === 0) throw new Error("掘金各分类都没取到数据");
  return items;
}

/** IT之家：科技数码 RSS */
async function fetchIthome(): Promise<HotItem[]> {
  return parseFeed(await getText("https://www.ithome.com/rss/"), LIMIT);
}

/** 少数派：效率 / 软件 RSS */
async function fetchSspai(): Promise<HotItem[]> {
  return parseFeed(await getText("https://sspai.com/feed"), LIMIT);
}

async function fetchGithub(): Promise<HotItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await fetch(
    `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=30`,
    {
      headers: { "user-agent": UA, accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as {
    items?: {
      full_name?: string;
      html_url?: string;
      stargazers_count?: number;
      language?: string | null;
      description?: string | null;
    }[];
  };
  return (data.items ?? []).slice(0, GITHUB_LIMIT).map((repo) => {
    const description = (repo.description ?? "").trim();
    return withId({
      title: repo.full_name ?? "(未知仓库)",
      url: repo.html_url ?? "",
      summary: description.slice(0, 300),
      meta: `★ ${repo.stargazers_count ?? 0} · ${repo.language ?? "—"}${description ? ` · ${description.slice(0, 70)}` : ""}`,
    });
  });
}

const FETCHERS: { id: string; load: () => Promise<HotItem[]> }[] = [
  { id: "juejin", load: fetchJuejin },
  { id: "ithome", load: fetchIthome },
  { id: "sspai", load: fetchSspai },
  { id: "github", load: fetchGithub },
];

export function readHot(): HotData | null {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as HotData;
    if (!raw || !Array.isArray(raw.sources)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** 按 id 找某条（详情页用） */
export function findHotItem(id: string): { item: HotItem; source: HotSource } | null {
  const data = readHot();
  if (!data) return null;
  for (const source of data.sources) {
    const item = source.items.find((entry) => entry.id === id);
    if (item) return { item, source };
  }
  return null;
}

function isFresh(data: HotData | null): boolean {
  if (!data) return false;
  const time = new Date(data.fetchedAt).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time < TTL_MS;
}

export async function refreshHot(options?: { force?: boolean }): Promise<HotData> {
  const current = readHot();
  if (!options?.force && isFresh(current)) return current as HotData;

  const sources: HotSource[] = [];
  for (const fetcher of FETCHERS) {
    const meta = META[fetcher.id] ?? { name: fetcher.id, home: "" };
    try {
      const items = await fetcher.load();
      sources.push({ id: fetcher.id, name: meta.name, home: meta.home, items });
    } catch (error) {
      const previous = current?.sources.find((item) => item.id === fetcher.id);
      sources.push({
        id: fetcher.id,
        name: meta.name,
        home: meta.home,
        items: previous?.items ?? [],
        error: error instanceof Error ? error.message : "抓取失败",
      });
    }
  }

  const data: HotData = { fetchedAt: new Date().toISOString(), sources };
  try {
    const dir = path.dirname(FILE);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  } catch {
    // 写盘失败不影响本次展示
  }
  return data;
}
