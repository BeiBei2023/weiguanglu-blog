import fs from "node:fs";
import path from "node:path";
import { GISCUS } from "@/lib/comments";
import { getAllPosts } from "@/lib/content";

/**
 * 评论动态：直接读 GitHub Discussions 的**公共 Atom feed**（不需要 token）。
 *
 * 本站评论区用的是 giscus，每条评论都存在 GISCUS.repo 这个仓库的 Discussions 里，
 * 所以「有没有人给我评论」= 那个仓库的 discussions feed 里有没有新条目。
 * GitHub 的 feed 只给最近 20 条，因此这里是「有没有新评论」的看板，完整对话去 GitHub 看。
 */
const FEED_URL = `https://github.com/${GISCUS.repo}/discussions.atom`;
const SEEN_FILE = path.join(process.cwd(), "data", "comments-seen.json");
/** 摘要截断长度 */
const EXCERPT = 180;

export interface CommentThread {
  /** feed 里的条目 id */
  id: string;
  /** GitHub 上的讨论 / 评论地址 */
  url: string;
  /** giscus 的 discussion 标题，如 posts/xxx（= 页面 pathname） */
  key: string;
  /** 站内对应链接（认不出来时为 null） */
  link: string | null;
  /** 站内展示名（文章标题 / 页面名） */
  label: string;
  author: string;
  avatar: string;
  published: string;
  updated: string;
  /** 正文纯文本摘要 */
  excerpt: string;
}

export interface CommentsFeed {
  at: string;
  repo: string;
  error: string | null;
  threads: CommentThread[];
  /** 最近一条动态的时间 */
  latest: string | null;
  /** 上次「标记已读」的时间 */
  seen: string | null;
  /** 比 seen 新的条目数 */
  unread: number;
}

// ── 「已读」时间戳（存 data/，gitignore） ─────────────────────────────

export function readCommentsSeen(): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")) as { at?: unknown };
    return typeof raw?.at === "string" && raw.at ? raw.at : null;
  } catch {
    return null;
  }
}

export function markCommentsSeen(at: string = new Date().toISOString()): string {
  try {
    fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
    const tmp = `${SEEN_FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ at }, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, SEEN_FILE);
  } catch {
    // 写不进去也不影响浏览
  }
  return at;
}

// ── Atom 解析（手写 regex，不引依赖） ────────────────────────────────

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function tagText(entry: string, name: string): string {
  const match = entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
}

function tagAttr(entry: string, name: string, attribute: string): string {
  const match = entry.match(new RegExp(`<${name}[^>]*\\b${attribute}="([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

const PAGE_LABEL: Record<string, string> = {
  about: "关于",
  links: "友链",
  tags: "标签",
  series: "系列",
  archive: "归档",
  disclaimer: "免责声明",
};

/** giscus 的标题 → 站内链接与展示名（标题可能是 "Re: posts/xxx" 这种评论条目） */
function routeOf(title: string, titles: Map<string, string>): { key: string; link: string | null; label: string } {
  const key = title.replace(/^re:\s*/i, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!key) return { key, link: "/", label: "首页" };
  if (key.startsWith("posts/")) {
    const slug = key.slice("posts/".length);
    return { key, link: `/posts/${slug}`, label: titles.get(slug) ?? slug };
  }
  if (PAGE_LABEL[key]) return { key, link: `/${key}`, label: PAGE_LABEL[key] };
  // 归档 /archive/2026、标签 /tags/xxx 之类
  if (/^(archive|tags|series)\/[A-Za-z0-9\u4e00-\u9fa5._-]+$/.test(key)) {
    return { key, link: `/${key}`, label: key };
  }
  return { key, link: null, label: key };
}

export async function readComments(): Promise<CommentsFeed> {
  const titles = new Map(getAllPosts().map((post) => [post.slug, post.title]));
  const seen = readCommentsSeen();

  let xml = "";
  let error: string | null = null;
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "blog-workbench/1.0", Accept: "application/atom+xml" },
      cache: "no-store",
    });
    if (!res.ok) error = `GitHub 返回 ${res.status}`;
    else xml = await res.text();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const threads: CommentThread[] = [];
  if (xml) {
    for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const entry = match[1];
      const title = textOf(tagText(entry, "title"));
      if (!title) continue;
      const { key, link, label } = routeOf(title, titles);
      const content = tagText(entry, "content");
      threads.push({
        id: tagText(entry, "id"),
        url: tagAttr(entry, "link", "href") || `https://github.com/${GISCUS.repo}/discussions`,
        key,
        link,
        label,
        author: textOf(tagText(entry, "name")) || "giscus",
        avatar: tagAttr(entry, "media:thumbnail", "url"),
        published: tagText(entry, "published"),
        updated: tagText(entry, "updated") || tagText(entry, "published"),
        excerpt: textOf(content).slice(0, EXCERPT),
      });
    }
  }

  threads.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  return {
    at: new Date().toISOString(),
    repo: GISCUS.repo,
    error,
    threads,
    latest: threads[0]?.updated ?? null,
    seen,
    unread: seen ? threads.filter((item) => item.updated > seen).length : threads.length,
  };
}
