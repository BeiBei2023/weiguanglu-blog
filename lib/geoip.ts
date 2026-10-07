import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "geoip");
/** 依次尝试的库文件名（GeoLite2-City / Country / DB-IP / IPinfo） */
const FILE_NAMES = ["GeoLite2-City.mmdb", "GeoLite2-Country.mmdb", "dbip-city-lite.mmdb"];
/** 官方镜像（无需账号，每月更新） */
export const GEOIP_DEFAULT_URL =
  "https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb";
/** 国内可访问的 GitHub 加速镜像（同一个文件；官方地址连不上时回退到它） */
const GEOIP_MIRROR_URL = `https://gh-proxy.com/${GEOIP_DEFAULT_URL}`;

/** 按顺序尝试的下载地址：参数 > GEOIP_URL > 官方 > 镜像 */
function geoipSources(explicit?: string): string[] {
  const list: string[] = [];
  if (explicit?.trim()) list.push(explicit.trim());
  const fromEnv = process.env.GEOIP_URL?.trim();
  if (fromEnv) list.push(fromEnv);
  list.push(GEOIP_DEFAULT_URL, GEOIP_MIRROR_URL);
  return [...new Set(list)];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export interface GeoInfo {
  country: string;
  region: string;
  city: string;
  /** 展示用：国家 · 省 · 城市 */
  label: string;
  /** 国家/地区两位代码（CN / US…，GeoLite2 提供；没有时为空串） */
  countryIso: string;
  /** 城市纬度（只有 City 库才有；没有时为 null） */
  lat: number | null;
  /** 城市经度（只有 City 库才有；没有时为 null） */
  lon: number | null;
}

export interface GeoipStatus {
  /** 库文件存在 */
  available: boolean;
  /** 已加载进内存，可以查 */
  ready: boolean;
  file: string | null;
  bytes: number;
  updatedAt: string | null;
  error: string | null;
  dir: string;
}

interface CityLike {
  country?: { names?: Record<string, string>; iso_code?: string };
  registered_country?: { names?: Record<string, string>; iso_code?: string };
  subdivisions?: { names?: Record<string, string> }[];
  city?: { names?: Record<string, string> };
  location?: { latitude?: number; longitude?: number };
}

let reader: { get: (ip: string) => unknown } | null = null;
let loadTried = false;
let loadError: string | null = null;
const cache = new Map<string, GeoInfo | null>();
const CACHE_MAX = 4000;

function findFile(): string | null {
  for (const name of FILE_NAMES) {
    const file = path.join(DIR, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export function geoipStatus(): GeoipStatus {
  const file = findFile();
  let bytes = 0;
  let updatedAt: string | null = null;
  if (file) {
    try {
      const st = fs.statSync(file);
      bytes = st.size;
      updatedAt = st.mtime.toISOString();
    } catch {
      // 忽略
    }
  }
  return {
    available: Boolean(file),
    ready: reader !== null,
    file: file ? path.relative(process.cwd(), file).split(path.sep).join("/") : null,
    bytes,
    updatedAt,
    error: loadError,
    dir: path.relative(process.cwd(), DIR).split(path.sep).join("/"),
  };
}

export function resetGeoip(): void {
  reader = null;
  loadTried = false;
  loadError = null;
  cache.clear();
}

/** 惰性加载库文件（没有库文件时安静降级，不算错误） */
export async function loadGeoip(): Promise<void> {
  if (loadTried) return;
  loadTried = true;
  const file = findFile();
  if (!file) return;
  try {
    const maxmind = await import("maxmind");
    reader = (await maxmind.open(file, { cache: { max: 2000 } })) as unknown as {
      get: (ip: string) => unknown;
    };
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    reader = null;
  }
}

export function isPrivateIp(ip: string): boolean {
  if (!ip) return false;
  if (ip.includes(":")) return /^(::1|fe80:|fc|fd|::ffff:127)/i.test(ip);
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function pickName(node: unknown): string {
  const names = (node as { names?: Record<string, string> } | undefined)?.names;
  if (!names) return "";
  return names["zh-CN"] ?? names.en ?? Object.values(names)[0] ?? "";
}

function pickIso(node: { iso_code?: string } | undefined): string {
  const code = node?.iso_code ?? "";
  return code && code !== "-99" ? code.toUpperCase() : "";
}

function coord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compute(ip: string): GeoInfo | null {
  if (!ip) return null;
  if (isPrivateIp(ip)) {
    return { country: "内网", region: "", city: "", label: "内网", countryIso: "", lat: null, lon: null };
  }
  if (!reader) return null;
  try {
    const data = reader.get(ip) as CityLike | null;
    if (!data) return null;
    const country = pickName(data.country) || pickName(data.registered_country);
    const region = data.subdivisions?.[0] ? pickName(data.subdivisions[0]) : "";
    const city = pickName(data.city);
    const label = [country, region, city].filter(Boolean).join(" · ");
    return {
      country,
      region,
      city,
      label: label || "未知",
      countryIso: pickIso(data.country) || pickIso(data.registered_country),
      lat: coord(data.location?.latitude),
      lon: coord(data.location?.longitude),
    };
  } catch {
    return null;
  }
}

/** 查 IP 归属地（同步；记得先 await loadGeoip()） */
export function lookupGeo(ip: string): GeoInfo | null {
  if (!ip || ip === "unknown") return null;
  const hit = cache.get(ip);
  if (hit !== undefined) return hit;
  const info = compute(ip);
  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(ip, info);
  return info;
}

/** 等响应头的上限（连接/重定向慢时不至于一直挂着） */
const CONNECT_MS = 60_000;
/** 已经开始收数据后，超过这么久没有新数据就认为卡死 */
const STALL_MS = 45_000;

/** 流式下载单个地址到临时文件，返回字节数 */
async function fetchToFile(url: string, tmp: string): Promise<number> {
  const controller = new AbortController();
  const started = Date.now();
  let headers = false;
  let bytes = 0;
  let last = started;
  const hard = setTimeout(() => controller.abort(), 600_000);
  const watchdog = setInterval(() => {
    const now = Date.now();
    const stalled = headers ? now - last > STALL_MS : now - started > CONNECT_MS;
    if (stalled) controller.abort();
  }, 3_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    headers = true;
    last = Date.now();
    const out = fs.createWriteStream(tmp);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        bytes += value.length;
        last = Date.now();
        if (!out.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => out.once("drain", () => resolve()));
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.once("error", reject);
      out.end(() => resolve());
    });
    return bytes;
  } finally {
    clearInterval(watchdog);
    clearTimeout(hard);
  }
}

function removeQuietly(file: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // 忽略
  }
}

/** 下载/更新地区库（多地址回退 + 流式写盘，成功后热加载） */
export async function downloadGeoipDatabase(
  url?: string,
): Promise<{ ok: boolean; bytes?: number; error?: string; source?: string }> {
  const target = path.join(DIR, "GeoLite2-City.mmdb");
  const tmp = `${target}.tmp-${Date.now()}`;
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const failed: string[] = [];
  for (const source of geoipSources(url)) {
    try {
      const bytes = await fetchToFile(source, tmp);
      if (bytes < 1_000_000) {
        removeQuietly(tmp);
        failed.push(`${hostOf(source)}：文件异常（只有 ${bytes} 字节，可能不是 mmdb）`);
        continue;
      }
      fs.renameSync(tmp, target);
      resetGeoip();
      return { ok: true, bytes, source };
    } catch (error) {
      removeQuietly(tmp);
      const msg = error instanceof Error ? error.message : String(error);
      failed.push(`${hostOf(source)}：${msg}`);
    }
  }
  return { ok: false, error: `下载失败（已尝试 ${failed.length} 个地址）——${failed.join("；")}` };
}
