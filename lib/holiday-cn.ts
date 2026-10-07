import fs from "node:fs";
import path from "node:path";
import { allFestivals, invalidateFestivalCache, writeFestivals } from "./festival";

/**
 * 国务院放假安排（数据来自开源项目 NateScarlet/holiday-cn，MIT）
 *
 * - 每天自动抓取国务院公告，每年公布新安排后自动更新
 * - 这里把「节假日」的日期合并成区间（含调休前后的连续放假），写进 data/festivals.json
 * - 原始 JSON 会缓存到 data/holiday-cn/<年>.json，网络不通时用缓存
 */

const DIR = path.join(process.cwd(), "data", "holiday-cn");

const SOURCES = (year: number): string[] => [
  `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
  `https://gh-proxy.com/https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
];

export interface HolidayDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

export interface HolidaySpan {
  name: string;
  start: string;
  end: string;
  days: number;
}

function cacheFile(year: number): string {
  return path.join(DIR, `${year}.json`);
}

function parse(raw: unknown): HolidayDay[] {
  const days = (raw as { days?: unknown } | null)?.days;
  if (!Array.isArray(days)) return [];
  const out: HolidayDay[] = [];
  for (const item of days) {
    const row = item as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ name: typeof row.name === "string" ? row.name : "", date, isOffDay: row.isOffDay !== false });
  }
  return out;
}

/** 读缓存（离线兜底） */
export function readCache(year: number): HolidayDay[] {
  try {
    return parse(JSON.parse(fs.readFileSync(cacheFile(year), "utf8").replace(/^\uFEFF/, "")));
  } catch {
    return [];
  }
}

/** 抓取某年数据（成功会写缓存）；失败返回 null */
export async function fetchHolidayYear(year: number): Promise<HolidayDay[] | null> {
  for (const url of SOURCES(year)) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "blog-workbench/1.0" }, cache: "no-store" });
      if (!res.ok) continue;
      const days = parse(await res.json());
      if (!days.length) continue;
      try {
        fs.mkdirSync(DIR, { recursive: true });
        const tmp = `${cacheFile(year)}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmp, JSON.stringify({ year, days }, null, 2), "utf8");
        fs.renameSync(tmp, cacheFile(year));
      } catch {
        // 缓存失败不影响同步
      }
      return days;
    } catch {
      // 换下一个源
    }
  }
  return null;
}

/** 把「放假的日子」按节日名合并成区间（如春节 8 天、国庆 7 天） */
export function holidaySpans(days: HolidayDay[]): HolidaySpan[] {
  const byName = new Map<string, string[]>();
  for (const day of days) {
    if (!day.isOffDay || !day.name) continue;
    const list = byName.get(day.name);
    if (list) list.push(day.date);
    else byName.set(day.name, [day.date]);
  }
  const spans: HolidaySpan[] = [];
  for (const [name, dates] of byName) {
    const sorted = [...dates].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const count = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
    spans.push({ name, start, end, days: count });
  }
  return spans.sort((a, b) => a.start.localeCompare(b.start));
}

/** 国务院的节日名 → 本站节日 id（一年可能把国庆与中秋连在一起，故返回数组） */
function matchIds(name: string): string[] {
  const out: string[] = [];
  if (name.includes("元旦")) out.push("new-year");
  if (name.includes("春节")) out.push("spring-festival");
  if (name.includes("清明")) out.push("qingming");
  if (name.includes("劳动")) out.push("labour");
  if (name.includes("端午")) out.push("dragon-boat");
  if (name.includes("中秋")) out.push("mid-autumn");
  if (name.includes("国庆")) out.push("national");
  return out;
}

export interface SyncResult {
  ok: boolean;
  year: number;
  /** 从哪儿拿的数据 */
  source: "network" | "cache" | "none";
  spans: HolidaySpan[];
  updated: { id: string; name: string; start: string; end: string }[];
  error?: string;
}

/**
 * 同步某一年的放假安排 → 写回 data/festivals.json
 * （会把法定节日的 start/end 换成国务院公布的区间，source 标记为 holiday-cn）
 */
export async function syncHolidays(year: number): Promise<SyncResult> {
  let days = await fetchHolidayYear(year);
  let source: SyncResult["source"] = days ? "network" : "none";
  if (!days) {
    days = readCache(year);
    source = days.length ? "cache" : "none";
  }
  if (!days.length) {
    return { ok: false, year, source: "none", spans: [], updated: [], error: `拿不到 ${year} 年的放假安排（网络不通且没有缓存）` };
  }
  const spans = holidaySpans(days);
  const entries = allFestivals().map((entry) => ({ ...entry }));
  const updated: SyncResult["updated"] = [];
  for (const span of spans) {
    for (const id of matchIds(span.name)) {
      const entry = entries.find((item) => item.id === id);
      if (!entry) continue;
      entry.start = span.start;
      entry.end = span.end;
      entry.days = span.days;
      entry.source = "holiday-cn";
      updated.push({ id: entry.id, name: entry.name, start: span.start, end: span.end });
    }
  }
  writeFestivals(entries, year);
  invalidateFestivalCache();
  return { ok: true, year, source, spans, updated };
}
