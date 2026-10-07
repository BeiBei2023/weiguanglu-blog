import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import { collectExtra, type SysExtra } from "./sysinfo-extra";
import { netStats, type NetStats } from "./net-stats";
import path from "node:path";
import { readTemps, TEMP_WARN, type TemperatureReading } from "./temps";
import { getAllPosts } from "@/lib/content";

const DATA_DIR = path.join(process.cwd(), "data");
const CONTENT_DIR = path.join(process.cwd(), "content");
const IMAGES_DIR = path.join(CONTENT_DIR, "images");
const DEPLOY_LOG = path.join(DATA_DIR, "deploy.log");
const BACKUP_STATUS = path.join(DATA_DIR, "backup-status.json");

export interface DiskInfo {
  label: string;
  path: string;
  ok: boolean;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percent: number;
  error?: string;
}

export interface ProbeInfo {
  name: string;
  host: string;
  port: number;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface SiteCheck {
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
}

export interface DeployInfo {
  path: string;
  exists: boolean;
  bytes: number;
  updatedAt: string | null;
  lines: string[];
}

export interface DataFileInfo {
  name: string;
  bytes: number;
  updatedAt: string;
}

export interface BackupStatusFile {
  at?: string;
  ok?: boolean;
  durationMs?: number;
  logTail?: string;
}

export interface BackupInfo {
  script: string;
  schedule: string;
  statusPath: string;
  status: BackupStatusFile | null;
  nextAt: string | null;
}

export interface RuntimeInfo {
  node: string;
  platform: string;
  arch: string;
  cpus: number;
  pid: number;
  timezone: string;
  processUptimeSec: number;
  processStartedAt: string;
  hostUptimeSec: number | null;
  memTotalBytes: number;
  memFreeBytes: number;
  rssBytes: number;
  loadavg: number[];
}

export interface SysInfo {
  now: string;
  runtime: RuntimeInfo;
  disks: DiskInfo[];
  probes: ProbeInfo[];
  site: SiteCheck;
  deploy: DeployInfo;
  data: { dir: string; bytes: number; files: number; items: DataFileInfo[] };
  backup: BackupInfo;
  content: { posts: number; publicPosts: number; images: number; imagesBytes: number };
  modules: ModulesInfo;
  /** 补充信息：CPU / 堆 / inode / 数据体检 / 内容统计 / 证书（见 sysinfo-extra.ts） */
  extra: SysExtra;
  /** 容器网络流量（/proc/net/dev + data/net-stats.json 累计） */
  net: NetStats;
  /** 温度：CPU / 主板（容器内实时）+ 硬盘（最近一次 SMART 采样） */
  temps: TemperatureReading;
  warnings: string[];
}

/** 各业务模块的一句话概况（任何一项失败都不影响其它项） */
export interface ModulesInfo {
  mqtt: {
    ok: boolean;
    enabled: boolean;
    listening: boolean;
    port: number;
    wsEnabled: boolean;
    wsListening: boolean;
    wsPort: number;
    accounts: number;
    online: number;
    error?: string;
  };
  ota: { ok: boolean; projects: number; error?: string };
  inventory: { ok: boolean; boxes: number; components: number; error?: string };
  views: { ok: boolean; total: number; articles: number; error?: string };
}

/* ── 工具 ─────────────────────────────────────────────── */

function statSafe(target: string): fs.Stats | null {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function diskInfo(label: string, target: string): DiskInfo {
  const base: DiskInfo = {
    label,
    path: target,
    ok: false,
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
    percent: 0,
  };
  try {
    const st = fs.statfsSync(target);
    const total = Number(st.blocks) * Number(st.bsize);
    const free = Number(st.bavail) * Number(st.bsize);
    const used = total - Number(st.bfree) * Number(st.bsize);
    return {
      ...base,
      ok: true,
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      percent: total > 0 ? used / total : 0,
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

function probePort(name: string, host: string, port: number, timeoutMs = 900): Promise<ProbeInfo> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ name, host, port, ok, ms: Date.now() - started, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "超时"));
    socket.once("error", (error: Error) => finish(false, error.message));
  });
}

async function checkSite(url: string): Promise<SiteCheck> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return { url, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readDeployLog(limit = 8): DeployInfo {
  const st = statSafe(DEPLOY_LOG);
  if (!st) return { path: DEPLOY_LOG, exists: false, bytes: 0, updatedAt: null, lines: [] };
  try {
    const text = fs.readFileSync(DEPLOY_LOG, "utf8");
    const lines = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-limit)
      .reverse();
    return {
      path: DEPLOY_LOG,
      exists: true,
      bytes: st.size,
      updatedAt: st.mtime.toISOString(),
      lines,
    };
  } catch (error) {
    return {
      path: DEPLOY_LOG,
      exists: true,
      bytes: st.size,
      updatedAt: st.mtime.toISOString(),
      lines: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function readDataDir(): { dir: string; bytes: number; files: number; items: DataFileInfo[] } {
  const items: DataFileInfo[] = [];
  let bytes = 0;
  let files = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(DATA_DIR, entry.name);
    const st = statSafe(full);
    if (!st) continue;
    if (entry.isDirectory()) {
      let dirBytes = 0;
      let dirFiles = 0;
      try {
        for (const child of fs.readdirSync(full, { withFileTypes: true })) {
          const childStat = statSafe(path.join(full, child.name));
          if (childStat?.isFile()) {
            dirBytes += childStat.size;
            dirFiles += 1;
          }
        }
      } catch {
        // 忽略子目录错误
      }
      items.push({ name: `${entry.name}/`, bytes: dirBytes, updatedAt: st.mtime.toISOString() });
      bytes += dirBytes;
      files += dirFiles;
    } else if (entry.isFile()) {
      items.push({ name: entry.name, bytes: st.size, updatedAt: st.mtime.toISOString() });
      bytes += st.size;
      files += 1;
    }
  }
  items.sort((a, b) => b.bytes - a.bytes);
  return { dir: DATA_DIR, bytes, files, items };
}

export function readBackupStatus(): BackupStatusFile | null {
  try {
    // 备份脚本早期版本会把 rclone 输出里的制表符原样写进 JSON 字符串，而 JSON 字符串里
    // 不允许出现裸控制字符 —— 这里先把控制字符替换成空格再解析：历史坏文件也能读出来，
    // 正常文件不受影响（token 之间的换行本来就只是空白）。
    const raw = fs.readFileSync(BACKUP_STATUS, "utf8").replace(/[\u0000-\u001f]/g, " ");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const source = parsed as Record<string, unknown>;
    const status: BackupStatusFile = {};
    if (typeof source.at === "string") status.at = source.at;
    if (typeof source.ok === "boolean") status.ok = source.ok;
    if (typeof source.durationMs === "number" && Number.isFinite(source.durationMs)) {
      status.durationMs = source.durationMs;
    }
    if (typeof source.logTail === "string") status.logTail = source.logTail;
    if (status.at === undefined && status.ok === undefined && status.durationMs === undefined && status.logTail === undefined) {
      return null;
    }
    return status;
  } catch {
    return null;
  }
}

/** 备份计划：宿主机 CST 的 04/16 点（每 12 小时一次，见 deploy/blog-backup.timer） */
const BACKUP_HOURS = [4, 16];
/** 备份计划按北京时间（UTC+8）计算，与容器自身时区无关 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function nextBackupAt(from = new Date()): string {
  // 把「UTC 字段」当作北京时间来推：这样即使容器跑在 UTC，算出的时刻也是对的
  const cst = new Date(from.getTime() + CST_OFFSET_MS);
  cst.setUTCMinutes(0, 0, 0);
  const hour = cst.getUTCHours();
  const slot = BACKUP_HOURS.find((value) => value > hour);
  if (slot === undefined) {
    cst.setUTCDate(cst.getUTCDate() + 1);
    cst.setUTCHours(BACKUP_HOURS[0]);
  } else {
    cst.setUTCHours(slot);
  }
  return new Date(cst.getTime() - CST_OFFSET_MS).toISOString();
}

function countImages(): { images: number; imagesBytes: number } {
  let images = 0;
  let imagesBytes = 0;
  try {
    for (const entry of fs.readdirSync(IMAGES_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      const st = statSafe(path.join(IMAGES_DIR, entry.name));
      if (!st) continue;
      images += 1;
      imagesBytes += st.size;
    }
  } catch {
    // 目录不存在时忽略
  }
  return { images, imagesBytes };
}

function hostUptimeSec(): number | null {
  try {
    const text = fs.readFileSync("/proc/uptime", "utf8");
    const value = Number(text.split(/\s+/)[0]);
    return Number.isFinite(value) ? Math.floor(value) : null;
  } catch {
    return null;
  }
}

/* ── 业务模块概况 ─────────────────────────────────────── */

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectModules(): Promise<ModulesInfo> {
  const modules: ModulesInfo = {
    mqtt: {
      ok: false,
      enabled: false,
      listening: false,
      port: Number(process.env.MQTT_PORT ?? 18830),
      wsEnabled: false,
      wsListening: false,
      wsPort: Number(process.env.MQTT_WS_PORT ?? 18831),
      accounts: 0,
      online: 0,
    },
    ota: { ok: false, projects: 0 },
    inventory: { ok: false, boxes: 0, components: 0 },
    views: { ok: false, total: 0, articles: 0 },
  };

  try {
    const [broker, store] = await Promise.all([
      import("@/lib/mqtt/broker"),
      import("@/lib/mqtt/store"),
    ]);
    const status = broker.mqttStatus();
    const config = await store.readMqttConfig();
    modules.mqtt = {
      ok: true,
      enabled: config.enabled,
      listening: status.listening,
      port: status.port,
      wsEnabled: config.wsEnabled,
      wsListening: status.wsListening,
      wsPort: status.wsPort,
      accounts: config.accounts.length,
      online: broker.mqttClients().length,
    };
  } catch (error) {
    modules.mqtt.error = errText(error);
  }

  try {
    const { listProjects } = await import("@/lib/ota");
    modules.ota = { ok: true, projects: listProjects().length };
  } catch (error) {
    modules.ota.error = errText(error);
  }

  try {
    const { readInventory } = await import("@/lib/inventory/store");
    const data = await readInventory();
    modules.inventory = {
      ok: true,
      boxes: data.boxes.length,
      components: data.components.length,
    };
  } catch (error) {
    modules.inventory.error = errText(error);
  }

  try {
    const { getAllViews } = await import("@/lib/views");
    const all = getAllViews();
    const entries = Object.entries(all);
    modules.views = {
      ok: true,
      total: entries.reduce((sum, [, count]) => sum + count, 0),
      articles: entries.filter(([, count]) => count > 0).length,
    };
  } catch (error) {
    modules.views.error = errText(error);
  }

  return modules;
}

/* ── 汇总 ─────────────────────────────────────────────── */

export async function sysInfo(): Promise<SysInfo> {
  const warnings: string[] = [];
  const now = new Date();

  let posts = 0;
  let publicPosts = 0;
  try {
    const all = getAllPosts();
    posts = all.length;
    publicPosts = all.filter((post) => post.visibility === "public").length;
  } catch (error) {
    warnings.push(`读取文章列表失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const mqttPort = Number(process.env.MQTT_PORT ?? 18830);
  const mqttWsPort = Number(process.env.MQTT_WS_PORT ?? 18831);
  const probes = await Promise.all([
    probePort(`站点 :3000`, "127.0.0.1", 3000),
    probePort(`MQTT :${mqttPort}`, "127.0.0.1", Number.isFinite(mqttPort) ? mqttPort : 18830),
    probePort(`MQTT/WS :${mqttWsPort}`, "127.0.0.1", Number.isFinite(mqttWsPort) ? mqttWsPort : 18831),
  ]);

  const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, "") ?? "";
  const site = await checkSite(siteUrl ? `${siteUrl}/` : "http://127.0.0.1:3000/");

  const imageInfo = countImages();
  if (imageInfo.images === 0) warnings.push("没有读到 content/images 里的图片");

  const mem = process.memoryUsage();

  const disks = [
    diskInfo("系统盘（data/）", DATA_DIR),
    diskInfo("内容盘（content/）", CONTENT_DIR),
    diskInfo("图片 / 视频", IMAGES_DIR),
  ];
  const extra = await collectExtra(siteUrl, disks);
  const temps = readTemps();
  if (temps.cpuPackage !== null && temps.cpuPackage >= TEMP_WARN) {
    warnings.push(`CPU 温度偏高：${temps.cpuPackage}℃（≥${TEMP_WARN}℃）`);
  } else if (temps.max !== null && temps.max >= TEMP_WARN) {
    warnings.push(`温度偏高：${temps.max}℃（≥${TEMP_WARN}℃）`);
  }

  return {
    now: now.toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      pid: process.pid,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      processUptimeSec: Math.floor(process.uptime()),
      processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      hostUptimeSec: hostUptimeSec(),
      memTotalBytes: os.totalmem(),
      memFreeBytes: os.freemem(),
      rssBytes: mem.rss,
      loadavg: os.loadavg(),
    },
    disks,
    probes,
    site,
    deploy: readDeployLog(),
    data: readDataDir(),
    backup: {
      script: "deploy/backup-rclone.sh",
      schedule: "每 12 小时（宿主机 04 / 16 点）",
      statusPath: BACKUP_STATUS,
      status: readBackupStatus(),
      nextAt: nextBackupAt(now),
    },
    content: { posts, publicPosts, images: imageInfo.images, imagesBytes: imageInfo.imagesBytes },
    modules: await collectModules(),
    extra,
    net: netStats(),
    temps,
    warnings: [...warnings, ...extra.warnings],
  };
}

/* ── 轻量摘要（工作台首页用：跳过站点自检与端口探活） ───── */

export interface SysSummary {
  now: string;
  uptimeSec: number;
  hostUptimeSec: number | null;
  memTotalBytes: number;
  memFreeBytes: number;
  disks: DiskInfo[];
  backup: BackupInfo;
  modules: ModulesInfo;
  content: SysInfo["content"];
  dataCount: number;
  dataBytes: number;
  /** 温度：CPU / 主板（容器内实时）+ 硬盘（最近一次 SMART 采样） */
  temps: TemperatureReading;
}

/** 工作台首页的仪表盘数据：比 sysInfo() 便宜（不做站点自检 / 端口探活） */
export async function sysSummary(): Promise<SysSummary> {
  const now = new Date();
  let posts = 0;
  let publicPosts = 0;
  try {
    const all = getAllPosts();
    posts = all.length;
    publicPosts = all.filter((post) => post.visibility === "public").length;
  } catch {
    // 首页仪表盘容错：读不到就显示 0
  }
  const imageInfo = countImages();
  const data = readDataDir();

  return {
    now: now.toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    hostUptimeSec: hostUptimeSec(),
    memTotalBytes: os.totalmem(),
    memFreeBytes: os.freemem(),
    disks: [diskInfo("系统盘（data/）", DATA_DIR), diskInfo("图片 / 视频", IMAGES_DIR)],
    backup: {
      script: "deploy/backup-rclone.sh",
      schedule: "每 12 小时（宿主机 04 / 16 点）",
      statusPath: BACKUP_STATUS,
      status: readBackupStatus(),
      nextAt: nextBackupAt(now),
    },
    modules: await collectModules(),
    content: { posts, publicPosts, images: imageInfo.images, imagesBytes: imageInfo.imagesBytes },
    dataCount: data.files,
    dataBytes: data.bytes,
    temps: readTemps(),
  };
}
