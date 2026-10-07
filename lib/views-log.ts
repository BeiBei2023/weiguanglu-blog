import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_FILE = path.join(DATA_DIR, "view-logs.jsonl");
const SETTINGS_FILE = path.join(DATA_DIR, "views-settings.json");
/** 流水文件超过该大小就裁剪（保留最新的 maxEntries 条） */
const TRIM_BYTES = 2 * 1024 * 1024;
/** maxEntries 的上限（防止有人手改配置写爆内存） */
const MAX_ENTRIES_CEIL = 50000;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 一条阅读流水 */
export interface ViewLogEntry {
  /** ISO 时间 */
  t: string;
  slug: string;
  ip: string;
  ua: string;
  /** 来源页的域名（拿不到时为空串） */
  ref: string;
  /** 匿名访客指纹：sha256(当日盐 + IP + UA) 前 10 位，用于统计独立访客 */
  vid: string;
  /** 疑似机器人（爬虫 / 命令行 / 无 UA） */
  bot: boolean;
  /** 自己（带后台登录态访问） */
  self: boolean;
}

export interface ViewsSettings {
  /** 最多保留多少条流水 */
  maxEntries: number;
  /** 页面显示时把 IP 打码（1.2.3.x）；存储始终完整 */
  maskIp: boolean;
  /** 是否记录 User-Agent */
  recordUa: boolean;
  /** 是否记录来源页 */
  recordRef: boolean;
  /** 是否记录疑似机器人的访问 */
  recordBots: boolean;
}

export const DEFAULT_VIEWS_SETTINGS: ViewsSettings = {
  maxEntries: 5000,
  maskIp: false,
  recordUa: true,
  recordRef: true,
  recordBots: true,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readViewsSettings(): ViewsSettings {
  const d = DEFAULT_VIEWS_SETTINGS;
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return { ...d };
    return {
      maxEntries: clampInt(raw.maxEntries, 200, MAX_ENTRIES_CEIL, d.maxEntries),
      maskIp: boolOr(raw.maskIp, d.maskIp),
      recordUa: boolOr(raw.recordUa, d.recordUa),
      recordRef: boolOr(raw.recordRef, d.recordRef),
      recordBots: boolOr(raw.recordBots, d.recordBots),
    };
  } catch {
    return { ...d };
  }
}

export function writeViewsSettings(patch: Partial<ViewsSettings>): ViewsSettings {
  const current = readViewsSettings();
  const next: ViewsSettings = {
    maxEntries: patch.maxEntries === undefined ? current.maxEntries : patch.maxEntries,
    maskIp: patch.maskIp === undefined ? current.maskIp : patch.maskIp,
    recordUa: patch.recordUa === undefined ? current.recordUa : patch.recordUa,
    recordRef: patch.recordRef === undefined ? current.recordRef : patch.recordRef,
    recordBots: patch.recordBots === undefined ? current.recordBots : patch.recordBots,
  };
  next.maxEntries = clampInt(next.maxEntries, 200, MAX_ENTRIES_CEIL, DEFAULT_VIEWS_SETTINGS.maxEntries);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, SETTINGS_FILE);
  return next;
}

// ── UA 解析（轻量正则，不引第三方库） ───────────────────────────────

export interface UaInfo {
  browser: string;
  os: string;
  device: string;
}

export function parseUa(ua: string | null | undefined): UaInfo {
  const s = (ua ?? "").trim();
  if (!s) return { browser: "未知", os: "未知", device: "未知" };

  let browser = "其它";
  if (/Edg[A-Za-z]*\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/MicroMessenger/.test(s)) browser = "微信";
  else if (/QQBrowser/.test(s)) browser = "QQ 浏览器";
  else if (/UCBrowser|UBrowser/.test(s)) browser = "UC";
  else if (/SamsungBrowser/.test(s)) browser = "三星浏览器";
  else if (/Firefox\/|FxiOS/.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";
  else if (/MSIE |Trident\//.test(s)) browser = "IE";

  let os = "其它";
  if (/HarmonyOS/.test(s)) os = "HarmonyOS";
  else if (/Windows NT/.test(s)) os = "Windows";
  else if (/Android/.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  const device = /iPad|Tablet/.test(s)
    ? "平板"
    : /Mobile|Android|iPhone|HarmonyOS/.test(s)
      ? "手机"
      : "电脑";

  return { browser, os, device };
}

const BOT_RE =
  /bot\b|crawler|spider|crawl|slurp|curl\/|wget|python-requests|python-urllib|python\/|aiohttp|httpx|scrapy|httpclient|headless|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptimerobot|uptime|monitor|facebookexternalhit|whatsapp|telegram|twitterbot|discordbot|slackbot|preview|validator|nmap|masscan|zgrab|go-http-client|okhttp|java\/|libwww|apache-httpclient|axios\/|node-fetch|undici|postmanruntime|insomnia|datadog/i;

/** 爬虫 / 命令行客户端 / 无 UA → 疑似机器人 */
export function isBotUa(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  if (!s) return true;
  return BOT_RE.test(s);
}

// ── 访客指纹 ────────────────────────────────────────────────────────

function dailySalt(at: Date): string {
  const secret = process.env.AUTH_SECRET ?? "wgl-views";
  const day = at.toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${secret}|${day}`).digest("hex").slice(0, 16);
}

/** 同一天内同 IP + 同 UA 视为同一访客；跨天盐变化 → 每天重新计一次 */
export function visitorId(ip: string, ua: string, at: Date = new Date()): string {
  return crypto.createHash("sha256").update(`${dailySalt(at)}|${ip}|${ua}`).digest("hex").slice(0, 10);
}

/** 按设置打码：1.2.3.4 → 1.2.3.x */
export function maskIp(ip: string): string {
  if (!ip) return "";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 2).join(":")}:…`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
}

// ── 写入 ────────────────────────────────────────────────────────────

let cache: ViewLogEntry[] | null = null;
let cacheSignature = "";

function fileSignature(): string {
  try {
    const st = fs.statSync(LOG_FILE);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function parseLine(line: string): ViewLogEntry | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const slug = typeof raw.slug === "string" ? raw.slug : "";
    const t = typeof raw.t === "string" ? raw.t : "";
    if (!slug || !t || !SLUG_RE.test(slug)) return null;
    return {
      t,
      slug,
      ip: typeof raw.ip === "string" ? raw.ip : "",
      ua: typeof raw.ua === "string" ? raw.ua : "",
      ref: typeof raw.ref === "string" ? raw.ref : "",
      vid: typeof raw.vid === "string" ? raw.vid : "",
      bot: raw.bot === true,
      self: raw.self === true,
    };
  } catch {
    return null;
  }
}

/** 读取流水（最新在前）；文件被外部改动会自动重载 */
export function readViewLogs(): ViewLogEntry[] {
  const sig = fileSignature();
  if (cache && sig === cacheSignature) return cache;
  cacheSignature = sig;
  let rows: ViewLogEntry[] = [];
  try {
    const text = fs.readFileSync(LOG_FILE, "utf8");
    rows = text.split("\n").map(parseLine).filter((row): row is ViewLogEntry => row !== null);
  } catch {
    rows = [];
  }
  rows.reverse();
  cache = rows;
  return rows;
}

function writeAtomicText(text: string): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${LOG_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, LOG_FILE);
  cache = null;
  cacheSignature = "";
}

function trimIfNeeded(settings: ViewsSettings): void {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size <= TRIM_BYTES) return;
    const rows = readViewLogs();
    if (rows.length <= settings.maxEntries) return;
    const kept = rows.slice(0, settings.maxEntries);
    writeAtomicText(kept.map((row) => JSON.stringify(row)).reverse().join("\n").concat("\n"));
  } catch {
    // 裁剪失败不影响写入
  }
}

/** 追加一条流水（已按设置决定是否脱敏 / 是否记录机器人）；失败不影响阅读计数 */
export function appendViewLog(entry: ViewLogEntry): void {
  const settings = readViewsSettings();
  if (entry.bot && !settings.recordBots) return;
  const row: ViewLogEntry = {
    ...entry,
    ua: settings.recordUa ? entry.ua.slice(0, 400) : "",
    ref: settings.recordRef ? entry.ref.slice(0, 200) : "",
  };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
    cache = null;
    cacheSignature = "";
    trimIfNeeded(settings);
  } catch {
    // 忽略
  }
}

export function clearViewLogs(): void {
  try {
    writeAtomicText("");
  } catch {
    // 忽略
  }
}

/** 手动按设置裁剪一次（改小 maxEntries 后调用） */
export function trimViewLogs(): void {
  try {
    const settings = readViewsSettings();
    const rows = readViewLogs();
    if (rows.length <= settings.maxEntries) return;
    const kept = rows.slice(0, settings.maxEntries);
    writeAtomicText(kept.map((row) => JSON.stringify(row)).reverse().join("\n").concat("\n"));
  } catch {
    // 忽略
  }
}

export interface ViewLogFileInfo {
  count: number;
  bytes: number;
  firstAt: string | null;
  lastAt: string | null;
  bots: number;
  self: number;
}

export function viewLogFileInfo(): ViewLogFileInfo {
  const rows = readViewLogs();
  let bytes = 0;
  try {
    bytes = fs.statSync(LOG_FILE).size;
  } catch {
    bytes = 0;
  }
  return {
    count: rows.length,
    bytes,
    firstAt: rows.length ? rows[rows.length - 1].t : null,
    lastAt: rows.length ? rows[0].t : null,
    bots: rows.filter((row) => row.bot).length,
    self: rows.filter((row) => row.self).length,
  };
}
