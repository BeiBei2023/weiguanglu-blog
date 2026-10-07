import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

/**
 * 服务器状态页的「补充信息」：进程资源、磁盘 inode、data/ JSON 体检、
 * 内容与阅读/库存摘要、图片大文件、HTTPS 证书剩余天数。
 * 全部在容器内部采集；任何一项失败都不抛错，只降级为 null / 空数组。
 */

const DATA_DIR = path.join(process.cwd(), "data");
const IMAGES_DIR = path.join(process.cwd(), "content", "images");

export interface InodeInfo {
  label: string;
  path: string;
  total: number;
  free: number;
  percent: number;
  ok: boolean;
}

export interface JsonCheck {
  name: string;
  bytes: number;
  /** 原始文本就是合法 JSON */
  ok: boolean;
  /** 原文非法、但清掉裸控制字符后能解析（旧备份状态文件就是这种情况） */
  sanitized: boolean;
  error?: string;
}

export interface ContentStats {
  posts: number;
  drafts: number;
  loginOnly: number;
  tags: number;
  series: number;
  words: number;
}

export interface ViewsStats {
  total: number;
  todayPv: number;
  todayUv: number;
  logCount: number;
  articles: number;
}

export interface InventoryStats {
  boxes: number;
  components: number;
  lowStock: number;
  disabled: number;
  totalQuantity: number;
}

export interface BigFile {
  name: string;
  bytes: number;
}

export interface CertInfo {
  host: string;
  validTo: string;
  daysLeft: number;
  issuer: string;
  error?: string;
}

export interface SysExtra {
  cpuPercent: number | null;
  cpus: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  memPercent: number;
  inodes: InodeInfo[];
  json: JsonCheck[];
  content: ContentStats;
  views: ViewsStats;
  inventory: InventoryStats;
  bigImages: BigFile[];
  cert: CertInfo | null;
  warnings: string[];
  ms: number;
}

/** 按北京时间取 YYYY-MM-DD（容器时区可能不是 CST，所以显式指定） */
function cstDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 进程 CPU 使用率（两次采样差分，约占 120ms） */
async function cpuPercent(): Promise<number | null> {
  try {
    const before = process.cpuUsage();
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const delta = process.cpuUsage(before);
    const elapsedUs = (Date.now() - start) * 1000;
    if (elapsedUs <= 0) return null;
    const cpus = Math.max(1, (await import("node:os")).cpus().length);
    const percent = ((delta.user + delta.system) / (elapsedUs * cpus)) * 100;
    return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
  } catch {
    return null;
  }
}

function inodeInfo(label: string, target: string): InodeInfo {
  try {
    const st = fs.statfsSync(target);
    const total = Number(st.files);
    const free = Number(st.ffree);
    const used = Math.max(0, total - free);
    return {
      label,
      path: target,
      total,
      free,
      percent: total > 0 ? used / total : 0,
      ok: true,
    };
  } catch {
    return { label, path: target, total: 0, free: 0, percent: 0, ok: false };
  }
}

/** data/ 下的 JSON 文件体检（顺便发现被写坏的文件） */
function jsonChecks(): JsonCheck[] {
  const out: JsonCheck[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(DATA_DIR, entry.name);
    let bytes = 0;
    try {
      bytes = fs.statSync(file).size;
    } catch {
      // 忽略
    }
    let raw = "";
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (error) {
      out.push({
        name: entry.name,
        bytes,
        ok: false,
        sanitized: false,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    try {
      JSON.parse(raw);
      out.push({ name: entry.name, bytes, ok: true, sanitized: false });
      continue;
    } catch (error) {
      try {
        JSON.parse(raw.replace(/[\u0000-\u001f]/g, " "));
        out.push({
          name: entry.name,
          bytes,
          ok: true,
          sanitized: true,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (inner) {
        out.push({
          name: entry.name,
          bytes,
          ok: false,
          sanitized: false,
          error: inner instanceof Error ? inner.message : String(inner),
        });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function contentStats(): Promise<ContentStats> {
  try {
    const { getAllPosts } = await import("@/lib/content");
    const posts = getAllPosts();
    const tags = new Set<string>();
    let words = 0;
    for (const post of posts) {
      for (const tag of post.tags) tags.add(tag);
      words += post.content.replace(/\s+/g, "").length;
    }
    const series = new Set(posts.map((post) => post.series).filter((value): value is string => Boolean(value)));
    return {
      posts: posts.length,
      drafts: posts.filter((post) => post.visibility === "draft").length,
      loginOnly: posts.filter((post) => post.visibility === "login").length,
      tags: tags.size,
      series: series.size,
      words,
    };
  } catch {
    return { posts: 0, drafts: 0, loginOnly: 0, tags: 0, series: 0, words: 0 };
  }
}

async function viewsStats(): Promise<ViewsStats> {
  const empty: ViewsStats = { total: 0, todayPv: 0, todayUv: 0, logCount: 0, articles: 0 };
  try {
    const { getAllViews } = await import("@/lib/views");
    const map = getAllViews();
    const values = Object.values(map);
    const total = values.reduce((sum, value) => sum + value, 0);
    let todayPv = 0;
    let todayUv = 0;
    let logCount = 0;
    try {
      const { readViewLogs, viewLogFileInfo } = await import("@/lib/views-log");
      const logs = readViewLogs();
      logCount = viewLogFileInfo().count;
      const today = cstDayKey(new Date());
      const seen = new Set<string>();
      for (const entry of logs) {
        if (entry.bot || entry.self) continue;
        if (cstDayKey(entry.t) !== today) continue;
        todayPv += 1;
        seen.add(entry.vid);
      }
      todayUv = seen.size;
    } catch {
      // 流水读不到就只给总数
    }
    return { total, todayPv, todayUv, logCount, articles: values.filter((value) => value > 0).length };
  } catch {
    return empty;
  }
}

async function inventoryStats(): Promise<InventoryStats> {
  const empty: InventoryStats = { boxes: 0, components: 0, lowStock: 0, disabled: 0, totalQuantity: 0 };
  try {
    const { readInventory } = await import("@/lib/inventory/store");
    const data = await readInventory();
    let lowStock = 0;
    let disabled = 0;
    let totalQuantity = 0;
    for (const item of data.components) {
      totalQuantity += item.quantity;
      if (!item.enabled) disabled += 1;
      else if (item.quantity < data.settings.lowStockThreshold) lowStock += 1;
    }
    return { boxes: data.boxes.length, components: data.components.length, lowStock, disabled, totalQuantity };
  } catch {
    return empty;
  }
}

function bigImages(limit = 5): BigFile[] {
  try {
    const files = fs
      .readdirSync(IMAGES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => {
        let bytes = 0;
        try {
          bytes = fs.statSync(path.join(IMAGES_DIR, entry.name)).size;
        } catch {
          bytes = 0;
        }
        return { name: entry.name, bytes };
      })
      .sort((a, b) => b.bytes - a.bytes);
    return files.slice(0, limit);
  } catch {
    return [];
  }
}

/** HTTPS 证书剩余天数（直连公网域名的 443） */
async function certInfo(siteUrl: string): Promise<CertInfo | null> {
  let host = "";
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    return null;
  }
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return await new Promise<CertInfo | null>((resolve) => {
    let done = false;
    const finish = (value: CertInfo | null) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // 忽略
      }
      resolve(value);
    };
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 6000 },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            finish({ host, validTo: "", daysLeft: 0, issuer: "", error: "没有拿到证书信息" });
            return;
          }
          const validTo = new Date(cert.valid_to);
          const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
          const issuerRaw = cert.issuer ?? {};
          const issuer = issuerRaw.O ?? issuerRaw.CN ?? "";
          finish({ host, validTo: validTo.toISOString(), daysLeft, issuer: String(issuer) });
        } catch (error) {
          finish({ host, validTo: "", daysLeft: 0, issuer: "", error: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    socket.on("timeout", () => finish({ host, validTo: "", daysLeft: 0, issuer: "", error: "连接超时" }));
    socket.on("error", (error) =>
      finish({ host, validTo: "", daysLeft: 0, issuer: "", error: error instanceof Error ? error.message : String(error) }),
    );
  });
}

function memPercent(): number {
  try {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    return totalBytes > 0 ? (totalBytes - freeBytes) / totalBytes : 0;
  } catch {
    return 0;
  }
}

export async function collectExtra(siteUrl: string, disks: { label: string; path: string; percent: number }[]): Promise<SysExtra> {
  const started = Date.now();
  const warnings: string[] = [];
  const [cpu, content, views, inventory, cert] = await Promise.all([
    cpuPercent(),
    contentStats(),
    viewsStats(),
    inventoryStats(),
    certInfo(siteUrl),
  ]);
  const memory = process.memoryUsage();
  const mem = memPercent();
  const inodes = [
    inodeInfo("data/（系统盘）", DATA_DIR),
    inodeInfo("图片 / 视频", IMAGES_DIR),
  ];
  const json = jsonChecks();
  const big = bigImages(5);

  for (const item of inodes) {
    if (item.ok && item.percent >= 0.85) {
      warnings.push(`${item.label} inode 使用率 ${(item.percent * 100).toFixed(0)}%（快满了会导致无法新建文件）`);
    }
  }
  for (const item of json) {
    if (!item.ok) warnings.push(`data/${item.name} 不是合法 JSON（${item.error ?? "解析失败"}）`);
  }
  if (mem >= 0.9) warnings.push(`系统内存已用 ${(mem * 100).toFixed(0)}%`);
  for (const disk of disks) {
    if (disk.percent >= 0.9) warnings.push(`${disk.label} 磁盘已用 ${(disk.percent * 100).toFixed(0)}%`);
  }
  if (cert && !cert.error && cert.daysLeft <= 14) {
    warnings.push(`HTTPS 证书还有 ${cert.daysLeft} 天到期（${cert.host}）`);
  }

  return {
    cpuPercent: cpu,
    cpus: (await import("node:os")).cpus().length,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    memPercent: mem,
    inodes,
    json,
    content,
    views,
    inventory,
    bigImages: big,
    cert,
    warnings,
    ms: Date.now() - started,
  };
}
