/**
 * 博客 · 素材台（imgtool）— 共享逻辑层
 *
 * 供 scripts/imgtool/index.ts 使用：
 *  · 常量与路径（图片目录 / 服务器地址 / 上限 / 提交范围）
 *  · 文件、git、ssh/scp 操作
 *  · 图片状态（本地 ⇄ 服务器）、文章引用扫描、公网校验
 *  · 回收站 / 上传历史 / alt 文本 / 去重索引（data/ 下，不进 git）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type http from "node:http";

export const ROOT = process.cwd();

/**
 * 读取 `.env.local` / `.env`（最小解析，零依赖）：IMGTOOL_SSH / IMGTOOL_SITE 等从这里来。
 * 真实环境变量优先（已存在的键不覆盖）。
 */
function loadDotEnv(): void {
  for (const name of [".env.local", ".env"]) {
    try {
      const text = fs.readFileSync(path.join(ROOT, name), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!match) continue;
        const key = match[1];
        if (process.env[key] !== undefined) continue;
        let value = match[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    } catch {
      /* 没有这个文件就跳过 */
    }
  }
}
loadDotEnv();
export const IMAGES = path.join(ROOT, "content", "images");
export const POSTS = path.join(ROOT, "content", "posts");
export const PAGE_FILE = path.join(ROOT, "scripts", "imgtool", "page.html");
export const HOST = "127.0.0.1";
export const PORT = Number(process.env.IMGTOOL_PORT ?? 4318);
/** 上传目标：ssh 别名/地址（用 IMGTOOL_SSH 覆盖；见 .env.example） */
export const SSH_HOST = process.env.IMGTOOL_SSH ?? "";
export const REMOTE_IMAGES = process.env.IMGTOOL_REMOTE ?? "";
/** 线上站点地址：用于「完整 URL」与发布后公网校验（用 IMGTOOL_SITE 覆盖） */
export const SITE = (process.env.IMGTOOL_SITE ?? "").replace(/\/+$/, "");
export const DATA_DIR = path.join(ROOT, "data");
export const TRASH_DIR = path.join(DATA_DIR, "imgtool-trash");
export const BACKUP_DIR = path.join(DATA_DIR, "imgtool-backups");
/** alt 文本表：与站点共用同一份（站点侧 `lib/images.ts` 也读写它），避免两处各存一份 */
export const ALT_FILE = path.join(DATA_DIR, "image-alt.json");
export const HISTORY_FILE = path.join(DATA_DIR, "imgtool-history.json");
export const HISTORY_MAX = 200;
/** 服务器文件清单缓存时长（毫秒） */
export const REMOTE_TTL = 30_000;
/** 引用扫描缓存时长（毫秒） */
export const REFS_TTL = 10_000;
/** 单个文件上限（MB）：图床下载 / 本地导入 */
export const MAX_FETCH_MB = Number(process.env.IMGTOOL_MAX_FETCH_MB ?? 50);
export const MAX_UPLOAD_MB = Number(process.env.IMGTOOL_MAX_UPLOAD_MB ?? 50);
/** 一次 scp 最多传几个文件 */
export const SCP_BATCH = 25;
/** 「发布 / 提交」只提交这些路径下的改动（避免误提交其它杂物） */
export const COMMIT_SCOPE = ["content", "原稿归档", "文档"];
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif", ".ico"]);
export const EXT_OK = new Set([
  ...IMAGE_EXT,
  ".pdf", ".zip", ".txt", ".h", ".c", ".hpp", ".cpp",
]);
export const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".avif": "image/avif",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8", ".h": "text/plain; charset=utf-8",
  ".c": "text/plain; charset=utf-8", ".hpp": "text/plain; charset=utf-8",
  ".cpp": "text/plain; charset=utf-8",
};

fs.mkdirSync(IMAGES, { recursive: true });

// ── 基础工具 ──
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}
export function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
export function sanitize(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext)
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|#%&{}$!'@+=`,;()\[\]]/g, "")
    .slice(0, 60);
  return (base || "image") + (EXT_OK.has(ext) ? ext : ".png");
}
export function autoName(ext: string, prefix: string): string {
  const pre = prefix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `${pre ? `${pre}-` : ""}${stamp()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
}
/** 在指定目录里避免重名（默认图片目录） */
export function uniqueIn(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let out = name;
  for (let i = 2; fs.existsSync(path.join(dir, out)); i++) out = `${base}-${i}${ext}`;
  return out;
}
export function unique(name: string): string {
  return uniqueIn(IMAGES, name);
}
export function imageUrl(name: string): string {
  return encodeURI(`/content-images/${name}`).replace(/%2F/g, "/");
}
export function markdownFor(name: string, alt = ""): string {
  return `![${alt}](${imageUrl(name)})`;
}
export function extOf(nameOrUrl: string, contentType = ""): string {
  let ext = path.extname(nameOrUrl.split("?")[0]).toLowerCase();
  if (!EXT_OK.has(ext)) {
    const map: Record<string, string> = {
      "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
      "image/webp": ".webp", "image/svg+xml": ".svg", "application/pdf": ".pdf",
    };
    ext = map[contentType.split(";")[0].trim()] ?? ".png";
  }
  return ext;
}
export function isImageName(name: string): boolean {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}
export function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
export function send(res: http.ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
export function sha1(buf: Buffer): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}
export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
export function writeJsonFile(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ── 文章 ──
export type PostInfo = { slug: string; title: string };
export function listPosts(): PostInfo[] {
  try {
    return fs
      .readdirSync(POSTS)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const raw = fs.readFileSync(path.join(POSTS, f), "utf8");
        const title = (raw.match(/^title:\s*(.+)$/m) || [])[1] ?? "";
        return { slug: f.replace(/\.md$/, ""), title: title.trim().replace(/^["']|["']$/g, "") };
      })
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}
export function postFile(slug: string): string {
  return path.join(POSTS, `${slug}.md`);
}
export function validSlug(slug: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(slug) && !slug.includes("..");
}

// ── 引用扫描 ──
export type RefKind = { kind: "local"; name: string } | { kind: "external"; url: string } | { kind: "other"; ref: string };
/** 把一个引用（markdown/html/裸路径）分类：本地图 / 外链 / 其它 */
export function classifyRef(rawRef: string): RefKind {
  const ref = rawRef.trim().replace(/^<|>$/g, "");
  if (!ref) return { kind: "other", ref: rawRef };
  if (/^https?:\/\//i.test(ref)) {
    if (ref.startsWith(`${SITE}/content-images/`)) {
      return { kind: "local", name: decodeSuffix(ref, `${SITE}/content-images/`) };
    }
    return { kind: "external", url: ref };
  }
  if (ref.startsWith("/content-images/")) {
    return { kind: "local", name: decodeSuffix(ref, "/content-images/") };
  }
  // 站点支持相对写法：images/foo.png、./foo.png
  const rel = ref.match(/^(?:\.\/)?images\/(.+)$/);
  if (rel) return { kind: "local", name: decodeURIComponent(rel[1]) };
  const dot = ref.match(/^\.\/([^/]+)$/);
  if (dot && EXT_OK.has(path.extname(dot[1]).toLowerCase())) return { kind: "local", name: decodeURIComponent(dot[1]) };
  return { kind: "other", ref };
}
function decodeSuffix(ref: string, prefix: string): string {
  const rest = decodeURIComponent(ref.slice(prefix.length).split(/[?#]/)[0]);
  return rest.split("/").pop() ?? rest;
}
/** 从一段 markdown 文本里提取引用（含重复去重前的原始顺序） */
export function extractRefs(text: string): { locals: Map<string, string>; external: string[]; other: string[] } {
  const locals = new Map<string, string>();
  const external: string[] = [];
  const other: string[] = [];
  const candidates: string[] = [];
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g)) candidates.push(m[1]);
  for (const m of text.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) candidates.push(m[1]);
  for (const m of text.matchAll(/\/content-images\/[^\s)"'<>\\]+/g)) candidates.push(m[0]);
  for (const candidate of candidates) {
    const kind = classifyRef(candidate);
    if (kind.kind === "local") {
      if (!locals.has(kind.name)) locals.set(kind.name, candidate.trim());
    } else if (kind.kind === "external") {
      if (!external.includes(kind.url)) external.push(kind.url);
    } else if (!other.includes(kind.ref)) {
      other.push(kind.ref);
    }
  }
  return { locals, external, other };
}
export type RefScan = {
  at: number;
  byName: Map<string, string[]>;
  bySlug: Map<string, { local: Set<string>; external: string[] }>;
};
let refsCache: RefScan | null = null;
export function scanAllRefs(force = false): RefScan {
  if (!force && refsCache && Date.now() - refsCache.at < REFS_TTL) return refsCache;
  const byName = new Map<string, string[]>();
  const bySlug = new Map<string, { local: Set<string>; external: string[] }>();
  for (const post of listPosts()) {
    let text = "";
    try {
      text = fs.readFileSync(postFile(post.slug), "utf8");
    } catch {
      continue;
    }
    const refs = extractRefs(text);
    bySlug.set(post.slug, { local: new Set(refs.locals.keys()), external: refs.external });
    for (const name of refs.locals.keys()) {
      const list = byName.get(name) ?? [];
      if (!list.includes(post.slug)) list.push(post.slug);
      byName.set(name, list);
    }
  }
  refsCache = { at: Date.now(), byName, bySlug };
  return refsCache;
}
export function invalidateRefs(): void {
  refsCache = null;
}

// ── 本地图片 / 服务器清单 ──
export type LocalImage = { name: string; bytes: number; mtimeMs: number };
export function listLocalImages(): LocalImage[] {
  try {
    return fs
      .readdirSync(IMAGES, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name !== ".gitkeep")
      .map((e) => {
        const st = fs.statSync(path.join(IMAGES, e.name));
        return { name: e.name, bytes: st.size, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}
let remoteCache: { at: number; map: Map<string, number> } | null = null;
function fetchRemoteImages(): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    const p = spawn("ssh", ["-q", SSH_HOST, `find ${REMOTE_IMAGES} -maxdepth 1 -type f -printf '%f\\t%s\\n'`]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", () => resolve(new Map()));
    p.on("close", (code) => {
      const map = new Map<string, number>();
      if (code === 0) {
        for (const line of out.split("\n")) {
          const tab = line.indexOf("\t");
          if (tab <= 0) continue;
          const size = Number(line.slice(tab + 1));
          if (Number.isFinite(size)) map.set(line.slice(0, tab), size);
        }
      }
      resolve(map);
    });
  });
}
/** 服务器已有图片清单（名 → 字节数）；带 REMOTE_TTL 缓存 */
export async function remoteImages(force = false): Promise<Map<string, number>> {
  if (!force && remoteCache && Date.now() - remoteCache.at < REMOTE_TTL) return remoteCache.map;
  const map = await fetchRemoteImages();
  remoteCache = { at: Date.now(), map };
  return map;
}
export function remoteAt(): number {
  return remoteCache?.at ?? 0;
}
export function remoteRemember(name: string, bytes: number): void {
  if (remoteCache) remoteCache.map.set(name, bytes);
}
export type UploadState = "ok" | "missing" | "differs";
export function uploadState(name: string, bytes: number, remote: Map<string, number>): UploadState {
  const r = remote.get(name);
  if (r === undefined) return "missing";
  return r === bytes ? "ok" : "differs";
}
export type LibImage = LocalImage & { state: UploadState; alt: string; refs: string[] };
export type LibView = {
  images: LibImage[];
  count: number;
  totalBytes: number;
  missing: number;
  unused: number;
  remoteExtra: string[];
  remoteAt: number;
};
export async function libraryView(force = false): Promise<LibView> {
  const local = listLocalImages();
  const remote = await remoteImages(force);
  const refs = scanAllRefs();
  const alt = readAltMap();
  const names = new Set(local.map((l) => l.name));
  const images: LibImage[] = local.map((l) => ({
    ...l,
    state: uploadState(l.name, l.bytes, remote),
    alt: alt[l.name] ?? "",
    refs: refs.byName.get(l.name) ?? [],
  }));
  return {
    images,
    count: images.length,
    totalBytes: images.reduce((s, i) => s + i.bytes, 0),
    missing: images.filter((i) => i.state !== "ok").length,
    unused: images.filter((i) => i.refs.length === 0).length,
    remoteExtra: [...remote.keys()].filter((n) => !names.has(n) && !n.startsWith(".")).sort(),
    remoteAt: remoteAt(),
  };
}

// ── alt 文本 / 上传历史 / 回收站（data/ 下，不进 git） ──
export type AltMap = Record<string, string>;
let altCache: { at: number; data: AltMap } | null = null;
export function readAltMap(): AltMap {
  if (altCache && Date.now() - altCache.at < 5000) return altCache.data;
  const data = readJsonFile<AltMap>(ALT_FILE, {});
  altCache = { at: Date.now(), data };
  return data;
}
export function setAlt(name: string, alt: string): AltMap {
  const data = readAltMap();
  const clean = alt.trim().slice(0, 200);
  if (clean) data[name] = clean;
  else delete data[name];
  writeJsonFile(ALT_FILE, data);
  altCache = { at: Date.now(), data };
  return data;
}
export type HistoryEntry = {
  at: string;
  kind: "import" | "fetch" | "upload" | "trash" | "restore" | "purge" | "publish" | "sync";
  name: string;
  bytes?: number;
  ok: boolean;
  note?: string;
};
export function readHistory(): HistoryEntry[] {
  return readJsonFile<HistoryEntry[]>(HISTORY_FILE, []);
}
export function pushHistory(entries: HistoryEntry | HistoryEntry[]): void {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  const all = [...list.reverse(), ...readHistory()].slice(0, HISTORY_MAX);
  writeJsonFile(HISTORY_FILE, all);
}
function nowIso(): string {
  return new Date().toISOString();
}
export type NamedResult = { name: string; ok: boolean; out: string };
export function trashNames(names: string[]): { name: string; ok: boolean; out: string; refs: string[] }[] {
  const byName = scanAllRefs().byName;
  const results = names.map((raw) => {
    const name = path.basename(raw);
    const src = path.join(IMAGES, name);
    const refs = byName.get(name) ?? [];
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      return { name, ok: false, out: "本地文件不存在", refs };
    }
    try {
      fs.mkdirSync(TRASH_DIR, { recursive: true });
      const dest = uniqueIn(TRASH_DIR, name);
      fs.renameSync(src, path.join(TRASH_DIR, dest));
      indexRemove(name);
      return { name, ok: true, out: dest === name ? "" : `重名，回收站里存为 ${dest}`, refs };
    } catch (e) {
      return { name, ok: false, out: e instanceof Error ? e.message : String(e), refs };
    }
  });
  pushHistory(
    results
      .filter((r) => r.ok)
      .map((r) => ({ at: nowIso(), kind: "trash" as const, name: r.name, ok: true, note: r.refs.length ? `仍被 ${r.refs.length} 篇文章引用` : "" })),
  );
  invalidateRefs();
  return results;
}
export function listTrash(): { name: string; bytes: number; mtimeMs: number }[] {
  try {
    return fs
      .readdirSync(TRASH_DIR, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const st = fs.statSync(path.join(TRASH_DIR, e.name));
        return { name: e.name, bytes: st.size, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}
export function restoreNames(names: string[]): NamedResult[] {
  const results = names.map((raw) => {
    const name = path.basename(raw);
    const src = path.join(TRASH_DIR, name);
    if (!fs.existsSync(src)) return { name, ok: false, out: "回收站里没有这个文件" };
    const dest = uniqueIn(IMAGES, name);
    try {
      fs.renameSync(src, path.join(IMAGES, dest));
      indexAddFile(dest);
      return { name, ok: true, out: dest === name ? "" : `重名，恢复为 ${dest}` };
    } catch (e) {
      return { name, ok: false, out: e instanceof Error ? e.message : String(e) };
    }
  });
  pushHistory(
    results
      .filter((r) => r.ok)
      .map((r) => ({ at: nowIso(), kind: "restore" as const, name: r.name, ok: true })),
  );
  return results;
}
export function purgeTrash(names: string[]): NamedResult[] {
  const results = names.map((raw) => {
    const name = path.basename(raw);
    const file = path.join(TRASH_DIR, name);
    if (!fs.existsSync(file)) return { name, ok: false, out: "回收站里没有这个文件" };
    try {
      fs.unlinkSync(file);
      return { name, ok: true, out: "" };
    } catch (e) {
      return { name, ok: false, out: e instanceof Error ? e.message : String(e) };
    }
  });
  pushHistory(
    results
      .filter((r) => r.ok)
      .map((r) => ({ at: nowIso(), kind: "purge" as const, name: r.name, ok: true })),
  );
  return results;
}
export function emptyTrash(): number {
  const list = listTrash();
  let n = 0;
  for (const t of list) {
    try {
      fs.unlinkSync(path.join(TRASH_DIR, t.name));
      n += 1;
    } catch {
      /* 忽略单个失败 */
    }
  }
  if (n) pushHistory({ at: nowIso(), kind: "purge", name: `全部清空（${n} 个文件）`, ok: true });
  return n;
}

// ── 去重索引（内存，启动时构建） ──
const hashIndex = new Map<string, string>();
let hashReady = false;
export function hashIndexSize(): number {
  return hashIndex.size;
}
export function buildHashIndex(): void {
  try {
    for (const f of listLocalImages()) {
      try {
        hashIndex.set(sha1(fs.readFileSync(path.join(IMAGES, f.name))), f.name);
      } catch {
        /* 单个文件读失败不影响整体 */
      }
    }
    hashReady = true;
  } catch {
    hashReady = false;
  }
}
function indexRemove(name: string): void {
  for (const [hash, n] of hashIndex) if (n === name) hashIndex.delete(hash);
}
function indexAddFile(name: string): void {
  try {
    hashIndex.set(sha1(fs.readFileSync(path.join(IMAGES, name))), name);
  } catch {
    /* 读不到就不进索引 */
  }
}
export function saveImage(buf: Buffer, originalName: string, prefix: string, keepName: boolean): string {
  const ext = extOf(originalName);
  const want = keepName ? sanitize(originalName) : autoName(ext, prefix);
  const name = unique(want);
  fs.writeFileSync(path.join(IMAGES, name), buf);
  hashIndex.set(sha1(buf), name);
  invalidateRefs();
  return name;
}
export type ImportResult = { name: string; bytes: number; deduped: boolean };
/** 存图：内容 sha1 命中已有图 → 直接复用（不入重复文件） */
export function importBuffer(buf: Buffer, originalName: string, prefix: string, keepName: boolean): ImportResult {
  if (hashReady) {
    const hit = hashIndex.get(sha1(buf));
    if (hit && fs.existsSync(path.join(IMAGES, hit))) return { name: hit, bytes: buf.length, deduped: true };
  }
  const name = saveImage(buf, originalName, prefix, keepName);
  return { name, bytes: buf.length, deduped: false };
}

// ── git / scp ──
export function runGit(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("git", args, { cwd: ROOT });
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", (e) => resolve({ code: 1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? 0, out: out.trim() }));
  });
}
export type UpResult = { name: string; ok: boolean; out: string; skipped?: boolean };
function runScp(files: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("scp", ["-q", ...files, `${SSH_HOST}:${REMOTE_IMAGES}/`]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", (e) => resolve({ code: 1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? 0, out: out.trim() }));
  });
}
/** scp 失败自动重试（默认 1 次重试，退避 300ms） */
async function runScpRetry(files: string[], retries = 1): Promise<{ code: number; out: string }> {
  const first = await runScp(files);
  if (first.code === 0) return first;
  let last = first;
  for (let i = 0; i < retries; i++) {
    await delay(300 * (i + 1));
    last = await runScp(files);
    if (last.code === 0) return last;
  }
  return last;
}

/** 用 scp 把本地图片上传到服务器（图片不在 git，靠这一步"发布"）
 *  · 服务器已有「同名 + 同大小」的文件 → 跳过（不重复传）
 *  · 其余按 SCP_BATCH 一批一次 scp（失败自动重试一次）；某批仍失败再逐个传以定位失败文件 */
export async function uploadToServer(names: string[]): Promise<UpResult[]> {
  const remote = await remoteImages();
  const results: UpResult[] = [];
  const todo: string[] = [];
  for (const raw of names) {
    const name = path.basename(raw);
    const src = path.join(IMAGES, name);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      results.push({ name, ok: false, out: "本地文件不存在" });
      continue;
    }
    const size = fs.statSync(src).size;
    if (remote.get(name) === size) {
      results.push({ name, ok: true, out: "服务器已有同名同大小文件，跳过", skipped: true });
      continue;
    }
    todo.push(name);
  }
  for (let i = 0; i < todo.length; i += SCP_BATCH) {
    const chunk = todo.slice(i, i + SCP_BATCH);
    const batch = await runScpRetry(chunk.map((n) => path.join(IMAGES, n)));
    if (batch.code === 0) {
      for (const n of chunk) results.push({ name: n, ok: true, out: "" });
      continue;
    }
    for (const n of chunk) {
      const one = await runScpRetry([path.join(IMAGES, n)]);
      results.push({ name: n, ok: one.code === 0, out: one.out || batch.out });
    }
  }
  const finished: HistoryEntry[] = [];
  for (const r of results) {
    const src = path.join(IMAGES, r.name);
    if (r.ok) {
      const bytes = fs.existsSync(src) ? fs.statSync(src).size : 0;
      remoteRemember(r.name, bytes);
      finished.push({ at: nowIso(), kind: "upload", name: r.name, bytes, ok: true, note: r.skipped ? "已存在，跳过" : "" });
    } else {
      finished.push({ at: nowIso(), kind: "upload", name: r.name, ok: false, note: r.out.slice(0, 300) });
    }
  }
  pushHistory(finished);
  if (remoteCache) remoteCache.at = Date.now();
  return results;
}

// ── 文章引用全景 / 发布后公网校验 ──
export type PostRefItem = { name: string; ref: string; local: boolean; state: UploadState | "unknown" };
export type PostRefs = {
  slug: string;
  title: string;
  exists: boolean;
  images: PostRefItem[];
  external: string[];
  other: string[];
  counts: { total: number; ready: number; missingUpload: number; missingLocal: number; external: number };
};
export async function postRefs(slug: string, forceRemote = false): Promise<PostRefs> {
  const file = postFile(slug);
  const exists = fs.existsSync(file);
  const text = exists ? fs.readFileSync(file, "utf8") : "";
  const title = (text.match(/^title:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  const refs = extractRefs(text);
  const remote = await remoteImages(forceRemote);
  const images: PostRefItem[] = [];
  for (const [name, ref] of refs.locals) {
    const localFile = path.join(IMAGES, name);
    const local = fs.existsSync(localFile) && fs.statSync(localFile).isFile();
    const state: UploadState | "unknown" = local ? uploadState(name, fs.statSync(localFile).size, remote) : "unknown";
    images.push({ name, ref, local, state });
  }
  const missingUpload = images.filter((i) => i.local && i.state !== "ok").length;
  const missingLocal = images.filter((i) => !i.local).length;
  const ready = images.filter((i) => i.local && i.state === "ok").length;
  return {
    slug,
    title,
    exists,
    images,
    external: refs.external,
    other: refs.other,
    counts: { total: images.length, ready, missingUpload, missingLocal, external: refs.external.length },
  };
}
export type PublicCheck = { name: string; status: number; ok: boolean };
/** 发布后校验：HEAD 线上图片地址，确认真的能访问到 */
export async function checkPublic(names: string[]): Promise<PublicCheck[]> {
  const queue = [...new Set(names)];
  const out: PublicCheck[] = [];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (;;) {
      const name = queue.shift();
      if (!name) return;
      const url = `${SITE}${imageUrl(name)}`;
      let status = 0;
      try {
        let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
        if (r.status === 405 || r.status === 501) {
          r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
          await r.body?.cancel().catch(() => {});
        }
        status = r.status;
      } catch {
        status = 0;
      }
      out.push({ name, status, ok: status >= 200 && status < 400 });
    }
  });
  await Promise.all(workers);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── 文章同步（不走 git：本地 content/posts ↔ 服务器 content/posts 直接对拷） ──
/** 服务器上的文章目录（与 SSH_HOST 配对；可用 IMGTOOL_REMOTE_POSTS 覆盖） */
export const REMOTE_POSTS = process.env.IMGTOOL_REMOTE_POSTS ?? "/srv/blog/content/posts";
/** 上次同步基线：记录每篇文章的 sha1，用来分辨「只有服务器改过」还是「只有本地改过」 */
export const SYNC_FILE = path.join(DATA_DIR, "imgtool-sync.json");
/** 同步前的自动备份目录 */
export const SYNC_BACKUP_DIR = path.join(BACKUP_DIR, "sync");

export type SyncState = "same" | "remote" | "local" | "conflict" | "new" | "localOnly";
export type SyncEntry = { hash: string; bytes: number };
export type SyncRow = {
  slug: string;
  title: string;
  state: SyncState;
  local: SyncEntry | null;
  remote: SyncEntry | null;
};
export type SyncPlan = {
  at: string;
  host: string;
  dir: string;
  baseAt: string;
  counts: Record<SyncState, number>;
  rows: SyncRow[];
};
export type SyncRunResult = {
  ok: boolean;
  direction: "pull" | "push";
  dryRun: boolean;
  slugs: string[];
  backup: string;
  images: { todo: number; done: number; failed: string[] };
  failed: { name: string; out: string }[];
  steps: string[];
};

/** 读文本文件并统一成 LF 换行（本地是 Windows CRLF、服务器是 LF，不统一会把纯换行差异当成内容冲突） */
function readTextLf(file: string): Buffer {
  return Buffer.from(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function sha1File(file: string): string {
  return sha1(readTextLf(file));
}

/** 把本地文章写出一份 LF 换行的临时副本（推回服务器时用，免得给服务器的 git 工作区塞进 CRLF） */
function lfCopy(slug: string): string {
  const dir = path.join(DATA_DIR, "imgtool-tmp");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${slug}.md`);
  fs.writeFileSync(dest, readTextLf(postFile(slug)));
  return dest;
}

/** 本地文章清单：slug → sha1 + 字节数 */
export function localPostManifest(): Map<string, SyncEntry> {
  const out = new Map<string, SyncEntry>();
  try {
    for (const name of fs.readdirSync(POSTS)) {
      if (!name.endsWith(".md")) continue;
      const full = path.join(POSTS, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        const buf = readTextLf(full);
        out.set(name.replace(/\.md$/, ""), { hash: sha1(buf), bytes: buf.length });
      } catch {
        /* 单个文件读不了就跳过 */
      }
    }
  } catch {
    /* 目录不存在 */
  }
  return out;
}

/** 跑一条远程命令（BatchMode：连不上就立刻失败，不会卡在密码提示上） */
function runSsh(script: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", SSH_HOST, script]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", (e) => resolve({ code: 1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? 0, out: out.trim() }));
  });
}

/** 远端文章清单（一条 ssh 拿完：sha1 + 字节数 + 文件名） */
export async function remotePostManifest(): Promise<Map<string, SyncEntry>> {
  const script =
    `cd '${REMOTE_POSTS}' 2>/dev/null || { echo "__NO_DIR__"; exit 3; }; ` +
    `for f in *.md; do [ -f "$f" ] || continue; ` +
    `printf '%s %s %s\\n' "$(tr -d '\\r' <"$f" | sha1sum | cut -d' ' -f1)" "$(tr -d '\\r' <"$f" | wc -c)" "$f"; done`;
  const r = await runSsh(script);
  if (r.code !== 0) {
    throw new Error(
      r.out.includes("__NO_DIR__") ? `服务器上没有目录 ${REMOTE_POSTS}` : r.out || `ssh 失败（退出码 ${r.code}）`,
    );
  }
  const out = new Map<string, SyncEntry>();
  for (const line of r.out.split("\n")) {
    const m = line.trim().match(/^([0-9a-f]{40}) (\d+) (.+)$/);
    if (!m) continue;
    out.set(m[3].replace(/\.md$/, ""), { hash: m[1], bytes: Number(m[2]) });
  }
  return out;
}

/** 读上次同步基线 */
export function readSyncBaseline(): { at: string; posts: Record<string, string> } {
  const raw = readJsonFile<{ at?: string; posts?: Record<string, string> }>(SYNC_FILE, {});
  return { at: raw.at ?? "", posts: raw.posts && typeof raw.posts === "object" ? raw.posts : {} };
}

/** 同步成功后更新基线（只更新这次动过的文件） */
function rememberSynced(slugs: string[], manifest: Map<string, SyncEntry>): void {
  const base = readSyncBaseline();
  for (const slug of slugs) {
    const hit = manifest.get(slug);
    if (hit) base.posts[slug] = hit.hash;
  }
  writeJsonFile(SYNC_FILE, { at: new Date().toISOString(), posts: base.posts });
}

/** 三方比对（本地 / 远端 / 上次基线），分清「只有服务器改过」与「只有本地改过」 */
export async function syncPlan(): Promise<SyncPlan> {
  const local = localPostManifest();
  const remote = await remotePostManifest();
  const baseline = readSyncBaseline();
  const titles = new Map(listPosts().map((p) => [p.slug, p.title]));
  const counts: Record<SyncState, number> = { same: 0, remote: 0, local: 0, conflict: 0, new: 0, localOnly: 0 };
  const rows: SyncRow[] = [];
  for (const slug of [...new Set([...local.keys(), ...remote.keys()])].sort()) {
    const l = local.get(slug) ?? null;
    const r = remote.get(slug) ?? null;
    const b = baseline.posts[slug] ?? null;
    let state: SyncState;
    if (l && r) {
      if (l.hash === r.hash) state = "same";
      else if (b && l.hash === b) state = "remote"; // 只有服务器改过 → 可以放心拉取
      else if (b && r.hash === b) state = "local"; // 只有本地改过 → 可以放心推送
      else state = "conflict"; // 两边都改过（或还没有基线）
    } else if (r) state = "new"; // 服务器有、本地没有
    else state = "localOnly"; // 本地有、服务器没有（还没发布）
    counts[state] += 1;
    rows.push({ slug, title: titles.get(slug) ?? "", state, local: l, remote: r });
  }
  const order: SyncState[] = ["conflict", "remote", "new", "local", "localOnly", "same"];
  rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.slug.localeCompare(b.slug));
  return { at: new Date().toISOString(), host: SSH_HOST, dir: REMOTE_POSTS, baseAt: baseline.at, counts, rows };
}

/** scp：远端文件 → 本地目录 */
function scpFrom(remoteDir: string, files: string[], destDir: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("scp", ["-q", ...files.map((f) => `${SSH_HOST}:${remoteDir}/${f}`), destDir]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", (e) => resolve({ code: 1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? 0, out: out.trim() }));
  });
}

/** scp：本地文件 → 远端目录 */
function scpTo(remoteDir: string, absFiles: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("scp", ["-q", ...absFiles, `${SSH_HOST}:${remoteDir}/`]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", (e) => resolve({ code: 1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? 0, out: out.trim() }));
  });
}

/** 备份本地文章到 data/imgtool-backups/sync/<时间戳>-<标记>/ */
function backupLocalPosts(slugs: string[], tag: string): string {
  const dest = path.join(SYNC_BACKUP_DIR, `${stamp()}-${tag}`);
  let n = 0;
  for (const slug of slugs) {
    const src = postFile(slug);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(src, path.join(dest, `${slug}.md`));
    n += 1;
  }
  return n ? path.relative(process.cwd(), dest).replace(/\\/g, "/") : "";
}

/** 推送前先把服务器上的原件拉下来备份 */
async function backupRemotePosts(slugs: string[], remote: Map<string, SyncEntry>, tag: string): Promise<string> {
  const have = slugs.filter((s) => remote.has(s));
  if (have.length === 0) return "";
  const dest = path.join(SYNC_BACKUP_DIR, `${stamp()}-${tag}`);
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (let i = 0; i < have.length; i += SCP_BATCH) {
    const chunk = have.slice(i, i + SCP_BATCH).map((s) => `${s}.md`);
    const r = await scpFrom(REMOTE_POSTS, chunk, dest);
    if (r.code === 0) {
      n += chunk.length;
      continue;
    }
    for (const f of chunk) {
      const one = await scpFrom(REMOTE_POSTS, [f], dest);
      if (one.code === 0) n += 1;
    }
  }
  return n ? path.relative(process.cwd(), dest).replace(/\\/g, "/") : "";
}

/** 图片：把服务器上有、本地缺/大小不一致的拉回来 */
async function pullImages(dryRun: boolean): Promise<{ todo: number; done: number; failed: string[] }> {
  const remote = await remoteImages(true);
  const todo: string[] = [];
  for (const [name, bytes] of remote) {
    const file = path.join(IMAGES, name);
    try {
      if (!fs.existsSync(file) || fs.statSync(file).size !== bytes) todo.push(name);
    } catch {
      todo.push(name);
    }
  }
  if (dryRun || todo.length === 0) return { todo: todo.length, done: 0, failed: [] };
  const failed: string[] = [];
  let done = 0;
  for (let i = 0; i < todo.length; i += SCP_BATCH) {
    const chunk = todo.slice(i, i + SCP_BATCH);
    const r = await scpFrom(REMOTE_IMAGES, chunk, IMAGES);
    if (r.code === 0) {
      done += chunk.length;
      continue;
    }
    for (const name of chunk) {
      const one = await scpFrom(REMOTE_IMAGES, [name], IMAGES);
      if (one.code === 0) done += 1;
      else failed.push(name);
    }
  }
  return { todo: todo.length, done, failed };
}

/** 图片：把本地有、服务器缺/大小不一致的传上去（复用 uploadToServer 的跳过逻辑） */
async function pushImages(dryRun: boolean): Promise<{ todo: number; done: number; failed: string[] }> {
  const remote = await remoteImages(true);
  const todo: string[] = [];
  for (const item of listLocalImages()) {
    if (remote.get(item.name) !== item.bytes) todo.push(item.name);
  }
  if (dryRun || todo.length === 0) return { todo: todo.length, done: 0, failed: [] };
  const results = await uploadToServer(todo);
  return {
    todo: todo.length,
    done: results.filter((r) => r.ok && !r.skipped).length,
    failed: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

/** 执行同步：pull = 服务器 → 本地；push = 本地 → 服务器（两边都先备份） */
export async function syncRun(
  direction: "pull" | "push",
  slugs: string[],
  opts: { images?: boolean; dryRun?: boolean } = {},
): Promise<SyncRunResult> {
  const plan = await syncPlan();
  const known = new Set(plan.rows.map((r) => r.slug));
  const wanted = slugs.map((s) => path.basename(s, ".md")).filter((s) => known.has(s));
  const steps: string[] = [];
  const failed: { name: string; out: string }[] = [];
  const done: string[] = [];
  const withImages = Boolean(opts.images);
  if (opts.dryRun) {
    const images = withImages
      ? direction === "pull"
        ? await pullImages(true)
        : await pushImages(true)
      : { todo: 0, done: 0, failed: [] as string[] };
    steps.push(`预览：${direction === "pull" ? "拉取" : "推送"} ${wanted.length} 篇${withImages ? ` + 图片 ${images.todo} 张` : ""}（未真正执行）`);
    return { ok: true, direction, dryRun: true, slugs: wanted, backup: "", images, failed, steps };
  }
  let backup = "";
  if (direction === "pull") {
    const remote = await remotePostManifest();
    const todo = wanted.filter((s) => remote.has(s));
    backup = backupLocalPosts(todo, "pull");
    if (backup) steps.push(`已备份本地原文件 → ${backup}`);
    for (let i = 0; i < todo.length; i += SCP_BATCH) {
      const chunk = todo.slice(i, i + SCP_BATCH);
      const r = await scpFrom(REMOTE_POSTS, chunk.map((s) => `${s}.md`), POSTS);
      if (r.code === 0) {
        done.push(...chunk);
        continue;
      }
      for (const s of chunk) {
        const one = await scpFrom(REMOTE_POSTS, [`${s}.md`], POSTS);
        if (one.code === 0) done.push(s);
        else failed.push({ name: s, out: one.out || r.out });
      }
    }
    if (done.length) {
      invalidateRefs();
      rememberSynced(done, localPostManifest());
    }
    steps.push(`从服务器拉取 ${done.length} 篇${failed.length ? `，失败 ${failed.length} 篇` : ""}`);
  } else {
    const remote = await remotePostManifest();
    backup = await backupRemotePosts(wanted, remote, "push");
    if (backup) steps.push(`已备份服务器原文件 → ${backup}`);
    const tmps: string[] = [];
    const send = (s: string): string => {
      const t = lfCopy(s);
      tmps.push(t);
      return t;
    };
    for (let i = 0; i < wanted.length; i += SCP_BATCH) {
      const chunk = wanted.slice(i, i + SCP_BATCH);
      const r = await scpTo(REMOTE_POSTS, chunk.map(send));
      if (r.code === 0) {
        done.push(...chunk);
        continue;
      }
      for (const s of chunk) {
        const one = await scpTo(REMOTE_POSTS, [send(s)]);
        if (one.code === 0) done.push(s);
        else failed.push({ name: s, out: one.out || r.out });
      }
    }
    for (const t of tmps) {
      try {
        fs.rmSync(t, { force: true });
      } catch {
        /* 临时文件删不掉也不影响 */
      }
    }
    if (done.length) rememberSynced(done, localPostManifest());
    steps.push(`推送到服务器 ${done.length} 篇${failed.length ? `，失败 ${failed.length} 篇` : ""}`);
  }
  let images = { todo: 0, done: 0, failed: [] as string[] };
  if (withImages) {
    images = direction === "pull" ? await pullImages(false) : await pushImages(false);
    steps.push(
      direction === "pull"
        ? `图片：下载 ${images.done}/${images.todo} 张${images.failed.length ? `，失败 ${images.failed.length} 张` : ""}`
        : `图片：上传 ${images.done}/${images.todo} 张${images.failed.length ? `，失败 ${images.failed.length} 张` : ""}`,
    );
  }
  pushHistory({
    at: new Date().toISOString(),
    kind: "sync",
    name: `${direction === "pull" ? "拉取" : "推送"} ${done.length} 篇`,
    ok: failed.length === 0,
    note: steps.join("；"),
  });
  return { ok: failed.length === 0, direction, dryRun: false, slugs: done, backup, images, failed, steps };
}

/** 读服务器上某篇文章的正文（「看差异」用；最多取 256 KB） */
export async function remotePostText(slug: string): Promise<string> {
  if (!validSlug(slug)) throw new Error("非法 slug");
  const r = await runSsh(`head -c 262144 '${REMOTE_POSTS}/${slug}.md'`);
  if (r.code !== 0) throw new Error(r.out || "读取失败");
  return r.out;
}

/** 行级 diff（借本地 git 对比两个临时文件；只做展示，不碰仓库） */
export async function diffText(a: string, b: string): Promise<string> {
  const dir = path.join(DATA_DIR, "imgtool-tmp");
  fs.mkdirSync(dir, { recursive: true });
  const fa = path.join(dir, `diff-a-${process.pid}.txt`);
  const fb = path.join(dir, `diff-b-${process.pid}.txt`);
  const norm = (s: string): string => s.replace(/\r\n/g, "\n");
  fs.writeFileSync(fa, norm(a), "utf8");
  fs.writeFileSync(fb, norm(b), "utf8");
  try {
    const r = await runGit(["--no-pager", "diff", "--no-index", "--unified=2", "--", fa, fb]);
    const out = r.out
      .split("\n")
      .filter((line) => !line.startsWith("warning:"))
      .join("\n")
      .trim();
    return out || "（两边内容一样）";
  } finally {
    fs.rmSync(fa, { force: true });
    fs.rmSync(fb, { force: true });
  }
}
