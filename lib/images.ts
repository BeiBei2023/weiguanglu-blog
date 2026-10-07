import fs from "node:fs";
import path from "node:path";
import { getAllPosts } from "./content";

const IMAGES_DIR = path.join(process.cwd(), "content", "images");
const TRASH_DIR = path.join(process.cwd(), "data", "image-trash");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);

/** 文件名白名单：只允许字母数字与 . _ -，且不能以点开头（防路径穿越与隐藏文件） */
const NAME_RE = /^[A-Za-z0-9._-]+$/;

export const MEDIA_PREFIX = "/content-images/";

export type MediaKind = "image" | "video" | "other";

export interface MediaRef {
  slug: string;
  title: string;
}

export interface MediaItem {
  name: string;
  bytes: number;
  /** 文件修改时间（ISO） */
  mtime: string;
  kind: MediaKind;
  /** alt 文本（存在 data/image-alt.json，不进 git） */
  alt: string;
  /** 引用它的文章 */
  refs: MediaRef[];
}

export interface MediaStats {
  total: number;
  bytes: number;
  images: number;
  videos: number;
  unused: number;
  big: number;
  trash: number;
}

export function isSafeName(name: string): boolean {
  return NAME_RE.test(name) && !name.startsWith(".");
}

/** 公开访问地址（站内路径） */
export function mediaUrl(name: string): string {
  return `${MEDIA_PREFIX}${encodeURIComponent(name)}`;
}

// ── alt 文本（存在 data/image-alt.json，和图片一样不进 git） ────────

const ALT_FILE = path.join(process.cwd(), "data", "image-alt.json");

/** 读 alt 表（按文件名）；文件损坏时返回空表 */
export function readAltMap(): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(ALT_FILE, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isSafeName(key) && typeof value === "string") out[key] = value.slice(0, 200);
    }
    return out;
  } catch {
    return {};
  }
}

/** 写一条 alt（空串表示删除该条） */
export function saveMediaAlt(name: string, alt: string): void {
  if (!isSafeName(name)) throw new Error("文件名不合法");
  const map = readAltMap();
  const text = alt.trim().slice(0, 200);
  if (text) map[name] = text;
  else delete map[name];
  fs.mkdirSync(path.dirname(ALT_FILE), { recursive: true });
  const tmp = `${ALT_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, ALT_FILE);
}

function kindOf(name: string): MediaKind {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "other";
}

/** 扫全部文章正文，建「图片 → 引用它的文章」索引（支持 /content-images/x 与 content-images/x） */
function referenceIndex(): Map<string, MediaRef[]> {
  const map = new Map<string, MediaRef[]>();
  let posts: { slug: string; title: string; content: string }[] = [];
  try {
    posts = getAllPosts();
  } catch {
    return map;
  }
  const re = /\/?content-images\/([A-Za-z0-9._-]+)/g;
  for (const post of posts) {
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((match = re.exec(post.content)) !== null) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const list = map.get(name) ?? [];
      list.push({ slug: post.slug, title: post.title });
      map.set(name, list);
    }
  }
  return map;
}

function trashCount(): number {
  try {
    return fs
      .readdirSync(TRASH_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith(".")).length;
  } catch {
    return 0;
  }
}

/** 回收站条目 */
export interface TrashItem {
  /** 回收站里的文件名 */
  name: string;
  /** 还原后的文件名（去掉自动加的 -YYYYmmddHHMMSS 后缀） */
  original: string;
  bytes: number;
  /** 进回收站的时间（ISO） */
  mtime: string;
  kind: MediaKind;
}

/** 回收站文件名里自动加的时间戳后缀（-20261001120000.png） */
const TRASH_SUFFIX_RE = /^(.*)-(\d{14})(\.[A-Za-z0-9]+)$/;

function originalName(name: string): string {
  const m = name.match(TRASH_SUFFIX_RE);
  return m ? `${m[1]}${m[3]}` : name;
}

/** 列出回收站内容（按进站时间倒序） */
export function listTrash(): TrashItem[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(TRASH_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const items: TrashItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    try {
      const stat = fs.statSync(path.join(TRASH_DIR, entry.name));
      items.push({
        name: entry.name,
        original: originalName(entry.name),
        bytes: stat.size,
        mtime: stat.mtime.toISOString(),
        kind: kindOf(entry.name),
      });
    } catch {
      // 读不到就跳过
    }
  }
  items.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return items;
}

/** 从回收站还原（同名已存在时自动加 -1、-2…） */
export function restoreMedia(names: string[]): { moved: string[]; failed: { name: string; error: string }[] } {
  const moved: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const name of names) {
    if (!isSafeName(name)) {
      failed.push({ name, error: "文件名不合法" });
      continue;
    }
    const from = path.join(TRASH_DIR, name);
    if (!from.startsWith(TRASH_DIR)) {
      failed.push({ name, error: "路径不合法" });
      continue;
    }
    try {
      if (!fs.existsSync(from)) {
        failed.push({ name, error: "回收站里没有这个文件" });
        continue;
      }
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      const want = originalName(name);
      const ext = path.extname(want);
      const base = path.basename(want, ext);
      let target = path.join(IMAGES_DIR, want);
      for (let i = 1; fs.existsSync(target) && i < 100; i += 1) {
        target = path.join(IMAGES_DIR, `${base}-${i}${ext}`);
      }
      if (fs.existsSync(target)) {
        failed.push({ name, error: "同名文件太多，先清理一下" });
        continue;
      }
      fs.renameSync(from, target);
      moved.push(path.basename(target));
    } catch (error) {
      failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { moved, failed };
}

/** 彻底删除回收站里的文件 */
export function purgeMedia(names: string[]): { removed: string[]; failed: { name: string; error: string }[] } {
  const removed: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const name of names) {
    if (!isSafeName(name)) {
      failed.push({ name, error: "文件名不合法" });
      continue;
    }
    const target = path.join(TRASH_DIR, name);
    if (!target.startsWith(TRASH_DIR)) {
      failed.push({ name, error: "路径不合法" });
      continue;
    }
    try {
      fs.rmSync(target, { force: true });
      removed.push(name);
    } catch (error) {
      failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { removed, failed };
}

/** 清空回收站，返回删掉的个数 */
export function purgeTrashAll(): number {
  const items = listTrash();
  const { removed } = purgeMedia(items.map((item) => item.name));
  return removed.length;
}

/** 列出 content/images 下的全部素材（按修改时间倒序） */
export function listMedia(): MediaItem[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const refs = referenceIndex();
  const altMap = readAltMap();
  const items: MediaItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    try {
      const stat = fs.statSync(path.join(IMAGES_DIR, entry.name));
      items.push({
        name: entry.name,
        bytes: stat.size,
        mtime: stat.mtime.toISOString(),
        kind: kindOf(entry.name),
        alt: altMap[entry.name] ?? "",
        refs: refs.get(entry.name) ?? [],
      });
    } catch {
      // 读不到的条目跳过
    }
  }
  items.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return items;
}

export function mediaStats(items: MediaItem[]): MediaStats {
  let bytes = 0;
  let images = 0;
  let videos = 0;
  let unused = 0;
  let big = 0;
  for (const item of items) {
    bytes += item.bytes;
    if (item.kind === "image") images += 1;
    if (item.kind === "video") videos += 1;
    if (item.refs.length === 0) unused += 1;
    if (item.bytes >= 1024 * 1024) big += 1;
  }
  return { total: items.length, bytes, images, videos, unused, big, trash: trashCount() };
}

/** 移入回收站（data/image-trash/），重名自动加时间戳后缀；不删除原图以外的任何文件 */
export function trashMedia(names: string[]): { moved: string[]; failed: { name: string; error: string }[] } {
  const moved: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const name of names) {
    if (!isSafeName(name)) {
      failed.push({ name, error: "文件名不合法" });
      continue;
    }
    const from = path.join(IMAGES_DIR, name);
    if (!from.startsWith(IMAGES_DIR)) {
      failed.push({ name, error: "路径不合法" });
      continue;
    }
    try {
      if (!fs.existsSync(from)) {
        failed.push({ name, error: "文件不存在" });
        continue;
      }
      fs.mkdirSync(TRASH_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      let target = path.join(TRASH_DIR, name);
      if (fs.existsSync(target)) target = path.join(TRASH_DIR, `${base}-${stamp}${ext}`);
      fs.renameSync(from, target);
      moved.push(name);
    } catch (error) {
      failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { moved, failed };
}
