import { getAllPosts } from "@/lib/content";
import { getAllViews } from "@/lib/views";
import {
  type UaInfo,
  type ViewLogEntry,
  type ViewLogFileInfo,
  type ViewsSettings,
  maskIp,
  parseUa,
  readViewLogs,
  readViewsSettings,
  viewLogFileInfo,
} from "@/lib/views-log";
import { type GeoInfo, type GeoipStatus, geoipStatus, loadGeoip, lookupGeo } from "@/lib/geoip";
import { cnRegionShort } from "@/lib/geo-names";

export interface Bucket {
  name: string;
  count: number;
}

export interface DayStat {
  day: string;
  pv: number;
  uv: number;
}

export interface PostStat {
  slug: string;
  title: string;
  date: string;
  /** views.json 里的累计阅读（含历史与爬虫） */
  views: number;
  today: number;
  week: number;
  /** 流水里出现的独立访客数 */
  uv: number;
}

export interface ViewEntryView {
  t: string;
  slug: string;
  title: string;
  ip: string;
  ipMasked: string;
  geo: string;
  ua: string;
  uaInfo: UaInfo;
  ref: string;
  bot: boolean;
  self: boolean;
}

export interface ViewsSnapshot {
  file: ViewLogFileInfo;
  totals: { allTime: number; today: DayStat; week: DayStat; month: DayStat };
  series: DayStat[];
  top: PostStat[];
  breakdown: { browser: Bucket[]; os: Bucket[]; device: Bucket[]; ref: Bucket[]; geo: Bucket[] };
  /** 访客地图：城市打点 + 省/国着色 */
  /** 访客地图：按时间范围预计算（近 7 天 / 近 30 天 / 全部） */
  map: Record<MapRange, VisitorMapData>;
  bots: { count: number; ratio: number };
  settings: ViewsSettings;
  geoip: GeoipStatus;
  entries: ViewEntryView[];
  now: string;
}

export interface ViewQuery {
  range: "1d" | "7d" | "30d" | "all";
  slug: string;
  q: string;
  includeBots: boolean;
  limit: number;
  offset: number;
}

// ── 访客地图 ────────────────────────────────────────────────────────

export interface MapPostRef {
  slug: string;
  title: string;
  count: number;
}

/** 一个城市（经纬度取两位小数合并）的访客概览——鼠标停留时展示 */
export interface MapSpot {
  key: string;
  /** 展示名：城市 → 省 → 国家 */
  name: string;
  country: string;
  region: string;
  city: string;
  countryIso: string;
  lon: number;
  lat: number;
  /** 浏览量 */
  pv: number;
  /** 独立访客 */
  uv: number;
  /** 占「已定位访客」的比例 0–1 */
  share: number;
  /** 最近一次访问时间 */
  last: string;
  device: Bucket[];
  browser: Bucket[];
  posts: MapPostRef[];
}

/** 省 / 国家着色用 */
export interface MapRegion {
  /** 中国 = 省短名（北京/广东/内蒙古）；世界 = 国家两位代码（CN/US） */
  name: string;
  pv: number;
  uv: number;
  /** 落在该区域的城市点数 */
  spots: number;
}

export interface VisitorMapData {
  spots: MapSpot[];
  china: MapRegion[];
  world: MapRegion[];
  maxSpotPv: number;
  maxRegionPv: number;
  /** 能定位的浏览量 / 定位不到的（内网、库里没有的 IP） */
  located: number;
  unknown: number;
  totalPv: number;
  totalUv: number;
}

/** 访客地图可选的时间范围 */
export type MapRange = "7d" | "30d" | "all";

function topBuckets(counter: Map<string, number>, limit: number): Bucket[] {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

interface RegionAcc {
  pv: number;
  vids: Set<string>;
  spots: Set<string>;
}

function addRegion(map: Map<string, RegionAcc>, key: string, vid: string): void {
  let acc = map.get(key);
  if (!acc) {
    acc = { pv: 0, vids: new Set(), spots: new Set() };
    map.set(key, acc);
  }
  acc.pv += 1;
  if (vid) acc.vids.add(vid);
}

function toRegions(map: Map<string, RegionAcc>): MapRegion[] {
  return [...map.entries()]
    .map(([name, acc]) => ({ name, pv: acc.pv, uv: acc.vids.size, spots: acc.spots.size }))
    .sort((a, b) => b.pv - a.pv || a.name.localeCompare(b.name));
}

interface SpotAcc {
  geo: GeoInfo;
  pv: number;
  vids: Set<string>;
  last: string;
  device: Map<string, number>;
  browser: Map<string, number>;
  posts: Map<string, number>;
}

/** 把真实访客流水聚合成地图数据（城市打点 + 省/国着色） */
function buildVisitorMap(real: ViewLogEntry[], titles: Map<string, string>): VisitorMapData {
  const spots = new Map<string, SpotAcc>();
  const china = new Map<string, RegionAcc>();
  const world = new Map<string, RegionAcc>();
  const allVids = new Set<string>();
  let located = 0;
  let unknown = 0;

  for (const entry of real) {
    if (entry.vid) allVids.add(entry.vid);
    const geo = lookupGeo(entry.ip);
    if (!geo || geo.countryIso === "" && geo.label === "内网") {
      unknown += 1;
      continue;
    }
    located += 1;
    const iso = geo.countryIso;
    if (iso) addRegion(world, iso, entry.vid);
    const province = iso === "CN" && geo.region ? cnRegionShort(geo.region) : "";
    if (province) addRegion(china, province, entry.vid);

    if (geo.lat === null || geo.lon === null) continue;
    const key = `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`;
    let spot = spots.get(key);
    if (!spot) {
      spot = { geo, pv: 0, vids: new Set(), last: "", device: new Map(), browser: new Map(), posts: new Map() };
      spots.set(key, spot);
      if (iso) world.get(iso)?.spots.add(key);
      if (province) china.get(province)?.spots.add(key);
    }
    spot.pv += 1;
    if (entry.vid) spot.vids.add(entry.vid);
    if (!spot.last || entry.t > spot.last) spot.last = entry.t;
    const ua = parseUa(entry.ua);
    spot.device.set(ua.device, (spot.device.get(ua.device) ?? 0) + 1);
    spot.browser.set(ua.browser, (spot.browser.get(ua.browser) ?? 0) + 1);
    spot.posts.set(entry.slug, (spot.posts.get(entry.slug) ?? 0) + 1);
  }

  const spotList: MapSpot[] = [...spots.entries()]
    .map(([key, spot]) => ({
      key,
      name: spot.geo.city || spot.geo.region || spot.geo.country || "未知",
      country: spot.geo.country,
      region: spot.geo.region,
      city: spot.geo.city,
      countryIso: spot.geo.countryIso,
      lon: spot.geo.lon ?? 0,
      lat: spot.geo.lat ?? 0,
      pv: spot.pv,
      uv: spot.vids.size,
      share: located ? spot.pv / located : 0,
      last: spot.last,
      device: topBuckets(spot.device, 3),
      browser: topBuckets(spot.browser, 3),
      posts: [...spot.posts.entries()]
        .map(([slug, count]) => ({ slug, title: titles.get(slug) ?? slug, count }))
        .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
        .slice(0, 3),
    }))
    .sort((a, b) => b.pv - a.pv || a.name.localeCompare(b.name))
    .slice(0, 300);

  const chinaList = toRegions(china);
  const worldList = toRegions(world);
  const maxOf = (list: MapRegion[]): number => list.reduce((max, item) => Math.max(max, item.pv), 0);

  return {
    spots: spotList,
    china: chinaList,
    world: worldList,
    maxSpotPv: spotList.reduce((max, spot) => Math.max(max, spot.pv), 0),
    maxRegionPv: Math.max(maxOf(chinaList), maxOf(worldList), 1),
    located,
    unknown,
    totalPv: located,
    totalUv: allVids.size,
  };
}

/** 本地时区的 YYYY-MM-DD */
function dayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDay(base: string, delta: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

/** 有效阅读 = 非机器人且非自己 */
function isReal(entry: ViewLogEntry): boolean {
  return !entry.bot && !entry.self;
}

function buildDayStat(entries: ViewLogEntry[]): DayStat {
  const vids = new Set<string>();
  for (const entry of entries) if (entry.vid) vids.add(entry.vid);
  return {
    day: entries.length ? dayKey(entries[0].t) : "",
    pv: entries.length,
    uv: vids.size,
  };
}

function countInRange(entries: ViewLogEntry[], fromDay: string): ViewLogEntry[] {
  return entries.filter((entry) => {
    const key = dayKey(entry.t);
    return key !== "" && key >= fromDay;
  });
}

function bucketize(entries: ViewLogEntry[], pick: (entry: ViewLogEntry) => string | null): Bucket[] {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const name = pick(entry);
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);
}

function refHost(referer: string): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return referer.split("/")[0] || null;
  }
}

function toEntryView(
  entry: ViewLogEntry,
  titleOf: Map<string, string>,
  mask: boolean,
): ViewEntryView {
  const geo = lookupGeo(entry.ip);
  return {
    t: entry.t,
    slug: entry.slug,
    title: titleOf.get(entry.slug) ?? entry.slug,
    ip: entry.ip,
    ipMasked: mask ? maskIp(entry.ip) : entry.ip,
    geo: geo?.label ?? "",
    ua: entry.ua,
    uaInfo: parseUa(entry.ua),
    ref: refHost(entry.ref) ?? "",
    bot: entry.bot,
    self: entry.self,
  };
}

function titleMap(): Map<string, string> {
  return new Map(getAllPosts().map((post) => [post.slug, post.title]));
}

function matchQuery(entry: ViewLogEntry, query: ViewQuery, titles: Map<string, string>): boolean {
  if (!query.includeBots && entry.bot) return false;
  if (query.slug && entry.slug !== query.slug) return false;
  if (query.range !== "all") {
    const days = query.range === "1d" ? 1 : query.range === "7d" ? 7 : 30;
    const from = shiftDay(dayKey(new Date()), -(days - 1));
    const key = dayKey(entry.t);
    if (!key || key < from) return false;
  }
  const q = query.q.trim().toLowerCase();
  if (q) {
    const haystack = [
      entry.slug,
      titles.get(entry.slug) ?? "",
      entry.ip,
      entry.ua,
      entry.ref,
      lookupGeo(entry.ip)?.label ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export function normalizeViewQuery(params: URLSearchParams): ViewQuery {
  const range = params.get("range");
  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));
  return {
    range: range === "1d" || range === "7d" || range === "30d" || range === "all" ? range : "7d",
    slug: params.get("slug") ?? "",
    q: params.get("q") ?? "",
    includeBots: params.get("bots") === "1",
    limit: Number.isFinite(limit) ? Math.min(2000, Math.max(1, Math.floor(limit))) : 200,
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
  };
}

/** 流水查询（热门榜/流水页签共用） */
export async function queryViewEntries(query: ViewQuery): Promise<{
  total: number;
  entries: ViewEntryView[];
  settings: ViewsSettings;
}> {
  await loadGeoip();
  const settings = readViewsSettings();
  const titles = titleMap();
  const rows = readViewLogs().filter((entry) => matchQuery(entry, query, titles));
  const page = rows.slice(query.offset, query.offset + query.limit);
  return {
    total: rows.length,
    entries: page.map((entry) => toEntryView(entry, titles, settings.maskIp)),
    settings,
  };
}

export async function buildViewsSnapshot(
  options: { days?: number; entryLimit?: number } = {},
): Promise<ViewsSnapshot> {
  const days = options.days ?? 30;
  const entryLimit = options.entryLimit ?? 200;
  await loadGeoip();

  const settings = readViewsSettings();
  const logs = readViewLogs();
  const titles = titleMap();
  const views = getAllViews();
  const real = logs.filter(isReal);

  const today = dayKey(new Date());
  const weekFrom = shiftDay(today, -6);
  const monthFrom = shiftDay(today, -29);

  const series: DayStat[] = [];
  const byDay = new Map<string, ViewLogEntry[]>();
  for (const entry of real) {
    const key = dayKey(entry.t);
    if (!key) continue;
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = shiftDay(today, -i);
    const list = byDay.get(key) ?? [];
    const stat = buildDayStat(list);
    series.push({ day: key, pv: stat.pv, uv: stat.uv });
  }

  const todayStat = buildDayStat(byDay.get(today) ?? []);
  todayStat.day = today;
  const weekStat = buildDayStat(countInRange(real, weekFrom));
  const monthStat = buildDayStat(countInRange(real, monthFrom));

  const perPost = new Map<string, { views: number; today: number; week: number; vids: Set<string> }>();
  for (const post of getAllPosts()) {
    perPost.set(post.slug, { views: views[post.slug] ?? 0, today: 0, week: 0, vids: new Set() });
  }
  for (const entry of real) {
    const stat = perPost.get(entry.slug);
    if (!stat) continue;
    if (entry.vid) stat.vids.add(entry.vid);
    const key = dayKey(entry.t);
    if (key === today) stat.today += 1;
    if (key && key >= weekFrom) stat.week += 1;
  }
  const titleOf = titles;
  const allTimeTotal = Object.values(views).reduce((sum, n) => sum + n, 0);
  const top: PostStat[] = [...perPost.entries()]
    .map(([slug, stat]) => ({
      slug,
      title: titleOf.get(slug) ?? slug,
      date: getAllPosts().find((post) => post.slug === slug)?.date ?? "",
      views: stat.views,
      today: stat.today,
      week: stat.week,
      uv: stat.vids.size,
    }))
    .filter((stat) => stat.views > 0 || stat.today > 0 || stat.week > 0)
    .sort((a, b) => b.today - a.today || b.week - a.week || b.views - a.views)
    .slice(0, 50);

  const bots = logs.filter((entry) => entry.bot).length;
  const entries = logs
    .filter((entry) => settings.recordBots || !entry.bot)
    .slice(0, entryLimit)
    .map((entry) => toEntryView(entry, titles, settings.maskIp));

  return {
    file: viewLogFileInfo(),
    totals: { allTime: allTimeTotal, today: todayStat, week: weekStat, month: monthStat },
    series,
    top,
    breakdown: {
      browser: bucketize(real, (entry) => parseUa(entry.ua).browser),
      os: bucketize(real, (entry) => parseUa(entry.ua).os),
      device: bucketize(real, (entry) => parseUa(entry.ua).device),
      ref: bucketize(real, (entry) => refHost(entry.ref) ?? "直接访问"),
      geo: bucketize(real, (entry) => lookupGeo(entry.ip)?.label ?? "未知"),
    },
    map: {
      "7d": buildVisitorMap(countInRange(real, weekFrom), titles),
      "30d": buildVisitorMap(countInRange(real, monthFrom), titles),
      all: buildVisitorMap(real, titles),
    },
    bots: { count: bots, ratio: logs.length ? bots / logs.length : 0 },
    settings,
    geoip: geoipStatus(),
    entries,
    now: new Date().toISOString(),
  };
}
