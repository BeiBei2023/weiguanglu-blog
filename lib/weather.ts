import fs from "node:fs";
import path from "node:path";

/**
 * 心知天气（Seniverse）客户端 —— 手写零依赖版。
 *
 * 官方 Node SDK `seniverse-api` 还是 v0.1.2（依赖已废弃的 request、老版本 joi/log4js），
 * 这里只按官方文档调 v3 接口，自己带磁盘缓存与错误码中文翻译。
 * 文档：https://docs.seniverse.com/ ；错误码：https://docs.seniverse.com/api/start/error.html
 */

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "weather-config.json");
const CACHE_FILE = path.join(DATA_DIR, "weather-cache.json");
const API_BASE = "https://api.seniverse.com/v3";
/** 单次请求超时 */
const TIMEOUT_MS = 8_000;

export type WeatherUnit = "c" | "f";

export interface WeatherConfig {
  /** 是否在侧栏显示天气挂件 */
  enabled: boolean;
  /** 公钥（uid）：只有「公钥 + 签名」方式才需要，直传私钥可留空 */
  uid: string;
  /** 私钥（key）：只存在服务器，不下发到浏览器 */
  key: string;
  /** 城市 V3 ID（推荐，如 WX4FBXXFKE4F）或城市中文名 */
  location: string;
  /** 展示用城市名（配置时自动带出） */
  locationName: string;
  /** 区/县的上级城市（如「从化」→「广州」）：心知免费版只到「城市」粒度，区/县查不到时自动退回它 */
  locationParent: string;
  unit: WeatherUnit;
  language: string;
  /** 缓存分钟数（5–180），省调用次数 */
  cacheMinutes: number;
}

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  enabled: true,
  uid: "",
  key: "",
  location: "beijing",
  locationName: "北京",
  locationParent: "",
  unit: "c",
  language: "zh-Hans",
  cacheMinutes: 15,
};

export interface WeatherNow {
  /** 天气现象文字，如「晴」 */
  text: string;
  /** 天气现象代码（见心知代码表） */
  code: string;
  /** 气温 */
  temperature: string;
}

export interface WeatherDay {
  date: string;
  textDay: string;
  codeDay: string;
  textNight: string;
  codeNight: string;
  high: string;
  low: string;
}

export interface WeatherPlace {
  name: string;
  path: string;
  country: string;
  timezone: string;
}

export interface WeatherSnapshot {
  ok: boolean;
  /** 失败原因（已翻成中文） */
  error?: string;
  /** 心知返回的原始错误码，便于排查 */
  errorCode?: string;
  place?: WeatherPlace;
  now?: WeatherNow;
  daily?: WeatherDay[];
  /** 心知给的 last_update */
  lastUpdate?: string;
  /** 本站取数时间（ISO） */
  fetchedAt: string;
  /** 是否用的是过期缓存（接口暂时挂了） */
  stale?: boolean;
  /** 区/县没有数据、自动换成了上级城市时带上这件事 */
  fallback?: { from: string; to: string };
}

export interface LocationHit {
  id: string;
  name: string;
  path: string;
  country: string;
  timezone: string;
}

/** 心知错误码 → 中文提示 */
const ERROR_TEXT: Record<string, string> = {
  AP010001: "请求参数有误",
  AP010002: "这个接口没有访问权限（可能免费版不含）",
  AP010003: "API 私钥无效，检查是否粘贴完整",
  AP010004: "签名错误",
  AP010005: "接口不存在",
  AP010006: "没有访问该地点的权限",
  AP010007: "JSONP 请求需要签名",
  AP010008: "域名未绑定",
  AP010009: "User-agent 不匹配",
  AP010010: "没找到这个地点，换个城市名或城市 ID 试试",
  AP010011: "IP 定位失败",
  AP010012: "心知天气服务已过期",
  AP010013: "账户余额不足",
  AP010014: "请求太频繁，稍后再试",
  AP010015: "不支持限行查询",
  AP010016: "不支持潮汐查询",
  AP010017: "坐标越界",
  AP100001: "心知天气内部错误",
  AP100002: "心知天气内部错误",
  AP100003: "心知天气内部错误",
  AP100004: "心知天气内部错误",
};

function errorText(code: string, status: string): string {
  return ERROR_TEXT[code] ?? status ?? "请求失败";
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function clampMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_WEATHER_CONFIG.cacheMinutes;
  return Math.min(180, Math.max(5, n));
}

// ── 配置（data/weather-config.json，gitignore，原子写、不带 BOM） ──────────

export function readWeatherConfig(): WeatherConfig {
  const d = DEFAULT_WEATHER_CONFIG;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return { ...d };
    const unit = raw.unit === "f" ? "f" : "c";
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
      uid: str(raw.uid),
      key: str(raw.key),
      location: str(raw.location) || d.location,
      locationName: str(raw.locationName),
      locationParent: str(raw.locationParent),
      unit,
      language: str(raw.language) || d.language,
      cacheMinutes: clampMinutes(raw.cacheMinutes),
    };
  } catch {
    return { ...d };
  }
}

export function writeWeatherConfig(patch: Partial<WeatherConfig>): WeatherConfig {
  const current = readWeatherConfig();
  const next: WeatherConfig = {
    enabled: patch.enabled === undefined ? current.enabled : Boolean(patch.enabled),
    uid: patch.uid === undefined ? current.uid : str(patch.uid).trim(),
    key: patch.key === undefined ? current.key : str(patch.key).trim(),
    location: (patch.location === undefined ? current.location : str(patch.location).trim()) || DEFAULT_WEATHER_CONFIG.location,
    locationName: patch.locationName === undefined ? current.locationName : str(patch.locationName).trim(),
    locationParent: patch.locationParent === undefined ? current.locationParent : str(patch.locationParent).trim(),
    unit: patch.unit === "f" ? "f" : patch.unit === "c" ? "c" : current.unit,
    language: (patch.language === undefined ? current.language : str(patch.language).trim()) || DEFAULT_WEATHER_CONFIG.language,
    cacheMinutes: patch.cacheMinutes === undefined ? current.cacheMinutes : clampMinutes(patch.cacheMinutes),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, CONFIG_FILE);
  return next;
}

/** 配好私钥和地点才算可用 */
export function weatherConfigured(config: WeatherConfig = readWeatherConfig()): boolean {
  return Boolean(config.key.trim() && config.location.trim());
}

// ── 取数 ────────────────────────────────────────────────────────────────

interface ApiResult {
  results?: {
    location?: { id?: string; name?: string; path?: string; country?: string; timezone?: string; timezone_offset?: string };
    /** location/search.json 给的是扁平对象（没有 location 包装），这里一并声明 */
    id?: string;
    name?: string;
    path?: string;
    country?: string;
    timezone?: string;
    now?: { text?: string; code?: string; temperature?: string };
    daily?: {
      date?: string;
      text_day?: string;
      code_day?: string;
      text_night?: string;
      code_night?: string;
      high?: string;
      low?: string;
    }[];
    last_update?: string;
  }[];
  status?: string;
  status_code?: string;
}

function url(config: WeatherConfig, endpoint: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams({ key: config.key, language: config.language, unit: config.unit, ...params });
  return `${API_BASE}${endpoint}?${search.toString()}`;
}

async function getJson(target: string): Promise<ApiResult> {
  const res = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`心知返回了非 JSON 内容（HTTP ${res.status}）`);
  }
  const obj = (data ?? {}) as ApiResult;
  if (obj.status_code) throw new ApiError(errorText(obj.status_code, str(obj.status)), obj.status_code);
  if (!res.ok) throw new Error(`心知接口 HTTP ${res.status}`);
  return obj;
}

export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

interface PlaceLike {
  location?: { id?: string; name?: string; path?: string; country?: string; timezone?: string };
}

function toPlace(item: PlaceLike | undefined): WeatherPlace {
  return {
    name: str(item?.location?.name),
    path: str(item?.location?.path),
    country: str(item?.location?.country),
    timezone: str(item?.location?.timezone),
  };
}

/** 拉一次实况 + 3 天预报 */
async function requestOnce(config: WeatherConfig): Promise<WeatherSnapshot> {
  const [nowRes, dailyRes] = await Promise.all([
    getJson(url(config, "/weather/now.json", { location: config.location })),
    getJson(url(config, "/weather/daily.json", { location: config.location, days: "3" })),
  ]);
  const nowItem = nowRes.results?.[0];
  const dailyItem = dailyRes.results?.[0];
  const now = nowItem?.now;
  const daily = (dailyItem?.daily ?? []).map((day) => ({
    date: str(day.date),
    textDay: str(day.text_day),
    codeDay: str(day.code_day),
    textNight: str(day.text_night),
    codeNight: str(day.code_night),
    high: str(day.high),
    low: str(day.low),
  }));
  return {
    ok: true,
    place: toPlace(nowItem ?? dailyItem),
    now: now
      ? { text: str(now.text), code: str(now.code), temperature: str(now.temperature) }
      : undefined,
    daily: daily.length ? daily : undefined,
    lastUpdate: str(nowItem?.last_update || dailyItem?.last_update),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 找区/县的上级城市：优先用配置里记的 `locationParent`，
 * 否则查一次城市接口（心知搜索给的是「从化,广州,广东,中国」这样的 path，第 2 段就是上级城市）。
 */
async function parentCity(config: WeatherConfig): Promise<string> {
  const saved = config.locationParent.trim();
  if (saved) return saved;
  const keyword = config.locationName.trim();
  if (!keyword) return "";
  try {
    const result = await searchLocation(keyword, config);
    const parts = (result.hits[0]?.path ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    // 「从化,广州,广东,中国」→ 广州；「北京,北京,中国」这类只有 3 段的不退
    return parts.length >= 4 ? parts[1] : "";
  } catch {
    return "";
  }
}

/**
 * 拉一次实况 + 3 天预报；心知免费版只覆盖「城市」粒度，区/县会回
 * AP010006（没有访问该地点的权限）→ 自动退回上级城市再试一次并标 `fallback`。
 */
async function requestWeather(config: WeatherConfig): Promise<WeatherSnapshot> {
  try {
    return await requestOnce(config);
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "";
    if (code !== "AP010006") throw error;
    const parent = await parentCity(config);
    if (!parent) throw error;
    const snapshot = await requestOnce({ ...config, location: parent, locationName: parent });
    return { ...snapshot, fallback: { from: config.locationName || config.location, to: parent } };
  }
}

interface CacheFile {
  at: number;
  /** 配置指纹：换了城市/单位就作废 */
  key: string;
  snapshot: WeatherSnapshot;
}

function cacheKey(config: WeatherConfig): string {
  return `${config.location}|${config.unit}|${config.language}`;
}

let memory: CacheFile | null = null;

function readCacheFile(): CacheFile | null {
  if (memory) return memory;
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CacheFile;
    if (!raw || typeof raw !== "object" || typeof raw.at !== "number" || !raw.snapshot) return null;
    memory = raw;
    return raw;
  } catch {
    return null;
  }
}

function writeCacheFile(config: WeatherConfig, snapshot: WeatherSnapshot): void {
  const data: CacheFile = { at: Date.now(), key: cacheKey(config), snapshot };
  memory = data;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${CACHE_FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(data)}\n`, "utf8");
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    // 缓存写失败不影响取数
  }
}

export function invalidateWeatherCache(): void {
  memory = null;
}

/**
 * 取天气：命中缓存直接返回；失败时回退上一次成功的数据并标 `stale`。
 * 没配私钥时返回 `{ ok: false, error: "还没配置心知天气的私钥" }`。
 */
export async function fetchWeather(options: { force?: boolean; config?: WeatherConfig } = {}): Promise<WeatherSnapshot> {
  const config = options.config ?? readWeatherConfig();
  const cached = readCacheFile();
  const fresh = cached && cached.key === cacheKey(config) && Date.now() - cached.at < config.cacheMinutes * 60_000;
  if (!options.force && fresh && cached.snapshot.ok) return cached.snapshot;

  if (!weatherConfigured(config)) {
    return {
      ok: false,
      error: "还没配置心知天气（在「工作台 → 天气」里填私钥并选城市）",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const snapshot = await requestWeather(config);
    writeCacheFile(config, snapshot);
    return snapshot;
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "";
    const message = error instanceof Error ? error.message : "取天气失败";
    if (cached && cached.snapshot.ok) {
      return { ...cached.snapshot, stale: true, error: message, errorCode: code || undefined };
    }
    return { ok: false, error: message, errorCode: code || undefined, fetchedAt: new Date().toISOString() };
  }
}

/** 给浏览器看的数据：不带私钥、不带城市 ID */
export async function publicWeatherSnapshot(force = false): Promise<WeatherSnapshot & { configured: boolean }> {
  const config = readWeatherConfig();
  const snapshot = await fetchWeather({ force, config });
  return { ...snapshot, configured: weatherConfigured(config), fetchedAt: snapshot.fetchedAt ?? new Date().toISOString() };
}

/** 城市搜索（拿 city V3 ID） */
export async function searchLocation(keyword: string, config?: WeatherConfig): Promise<{ ok: boolean; error?: string; hits: LocationHit[] }> {
  const current = config ?? readWeatherConfig();
  const q = keyword.trim();
  if (!q) return { ok: false, error: "请输入城市名", hits: [] };
  if (!current.key.trim()) return { ok: false, error: "先填私钥再搜城市", hits: [] };
  try {
    const data = await getJson(url(current, "/location/search.json", { q }));
    // 注意：/location/search.json 返回的是**扁平**对象（{id,name,path,country,timezone}），
    // 与 /weather/*.json 的 { location: {...} } 不同 —— 两种形状都认，否则结果列表会渲染成空行。
    const hits = (data.results ?? [])
      .slice(0, 10)
      .map((item) => {
        const loc = item.location ?? item;
        return {
          id: str(loc?.id),
          name: str(loc?.name),
          path: str(loc?.path),
          country: str(loc?.country),
          timezone: str(loc?.timezone),
        };
      })
      .filter((hit) => hit.id || hit.name);
    if (!hits.length) return { ok: false, error: "没搜到这个地点", hits: [] };
    return { ok: true, hits };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "搜索失败", hits: [] };
  }
}
