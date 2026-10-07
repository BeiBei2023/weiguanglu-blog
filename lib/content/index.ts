import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Post, PostMeta, TagCount, Visibility, YearGroup } from "./types";

export type { Post, PostMeta, TagCount, Visibility, YearGroup } from "./types";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

let cache: Post[] | null = null;
let cacheSignature = "";

/** 供 watcher（M7）在文件变化后调用 */
export function invalidateContentCache(): void {
  cache = null;
  cacheSignature = "";
}

/**
 * 内容目录签名（文件数 + 最新 mtime）。
 * 缓存自校验用：Next 下服务端组件与路由处理器可能是不同模块实例，
 * 单靠进程内 invalidate 无法跨实例生效，故每次读取前比对签名。
 */
export function getContentSignature(): string {
  if (!fs.existsSync(POSTS_DIR)) return "empty";
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."));
  let maxMtime = 0;
  for (const file of files) {
    const stat = fs.statSync(path.join(POSTS_DIR, file));
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
  }
  return `${files.length}:${maxMtime}`;
}

function normalizeVisibility(value: unknown): Visibility {
  return value === "public" || value === "login" || value === "draft" ? value : "draft";
}

function formatDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function parsePost(file: string): Post {
  const fullPath = path.join(POSTS_DIR, file);
  const raw = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(raw);
  const slug = file.replace(/\.md$/i, "");
  return {
    slug,
    title: String(data.title ?? slug),
    date: formatDate(data.date),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    description: String(data.description ?? ""),
    visibility: normalizeVisibility(data.visibility),
    series: data.series ? String(data.series).trim() : undefined,
    seriesOrder: Number.isFinite(Number(data.seriesOrder)) && data.seriesOrder !== "" && data.seriesOrder != null
      ? Number(data.seriesOrder)
      : undefined,
    content: content.trim(),
    updatedAt: fs.statSync(fullPath).mtimeMs,
  };
}

function load(): Post[] {
  const signature = getContentSignature();
  if (cache && cacheSignature === signature) return cache;
  if (!fs.existsSync(POSTS_DIR)) {
    cache = [];
    cacheSignature = signature;
    return cache;
  }
  cache = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .map(parsePost)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  cacheSignature = signature;
  return cache;
}

export function getAllPosts(): Post[] {
  return load();
}

export function toMeta(post: Post): PostMeta {
  const { slug, title, date, tags, description, visibility, series, seriesOrder } = post;
  return { slug, title, date, tags, description, visibility, series, seriesOrder };
}

/** 阅读区可见文章：public 恒可见；login 仅登录后可见；draft 永不出现在阅读区 */
export function getReadingPosts(authenticated: boolean): Post[] {
  return load().filter(
    (p) => p.visibility === "public" || (authenticated && p.visibility === "login"),
  );
}

export function getPublicPosts(): Post[] {
  return load().filter((p) => p.visibility === "public");
}

export function getDrafts(): Post[] {
  return load().filter((p) => p.visibility === "draft");
}

export function getPostBySlug(slug: string): Post | undefined {
  return load().find((p) => p.slug === slug);
}

export function getReadablePost(slug: string, authenticated: boolean): Post | undefined {
  const post = getPostBySlug(slug);
  if (!post) return undefined;
  if (post.visibility === "public") return post;
  if (post.visibility === "login" && authenticated) return post;
  return undefined;
}

/** 按日期统计文章数：{ "YYYY-MM-DD": count } */
export function getDateCounts(posts: Post[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    if (!post.date) continue;
    counts[post.date] = (counts[post.date] ?? 0) + 1;
  }
  return counts;
}

export function getTagCounts(posts: Post[] = getPublicPosts()): TagCount[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function groupByYear(posts: Post[]): YearGroup[] {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const year = post.date.slice(0, 4) || "未知";
    const list = groups.get(year) ?? [];
    list.push(post);
    groups.set(year, list);
  }
  return [...groups.entries()]
    .map(([year, posts]) => ({ year, posts }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

/** posts 需按日期倒序：prev = 更新的一篇，next = 更旧的一篇 */
export function getAdjacentPosts(slug: string, posts: Post[]): { prev?: Post; next?: Post } {
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) return {};
  return { prev: posts[index - 1], next: posts[index + 1] };
}

/** 系列内文章：按 seriesOrder 升序，未标序号的排最后（同组按日期升序） */
export function getSeriesPosts(series: string, posts: Post[] = load()): Post[] {
  return posts
    .filter((p) => p.series === series)
    .sort((a, b) => {
      const ao = a.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug.localeCompare(b.slug);
    });
}

export interface SeriesInfo {
  name: string;
  count: number;
  /** 系列内最新一篇的日期 */
  latest: string;
  posts: Post[];
}

/** 所有系列，按最近更新排序 */
export function listSeries(posts: Post[] = load()): SeriesInfo[] {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    if (!post.series) continue;
    const list = groups.get(post.series) ?? [];
    list.push(post);
    groups.set(post.series, list);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const ordered = getSeriesPosts(name, list);
      const latest = ordered.reduce((max, p) => (p.date > max ? p.date : max), "");
      return { name, count: ordered.length, latest, posts: ordered };
    })
    .sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : a.name.localeCompare(b.name)));
}

/** 相关文章：共享标签数降序（至少共享 1 个标签），数量不足则按日期补足 */
export function getRelatedPosts(post: Post, posts: Post[], limit = 3): Post[] {
  const tags = new Set(post.tags);
  const scored = posts
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ post: p, score: p.tags.filter((tag) => tags.has(tag)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1))
    .map((item) => item.post);
  if (scored.length >= limit) return scored.slice(0, limit);
  const chosen = new Set(scored.map((p) => p.slug));
  for (const p of posts) {
    if (scored.length >= limit) break;
    if (p.slug === post.slug || chosen.has(p.slug)) continue;
    scored.push(p);
    chosen.add(p.slug);
  }
  return scored.slice(0, limit);
}
