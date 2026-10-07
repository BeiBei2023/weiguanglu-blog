import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_FESTIVALS,
  type FestivalEffect,
  type FestivalEntry,
  type FestivalKind,
  type FestivalRule,
} from "./festival-defaults";
import { lunarToSolar, solarToLunar } from "./festival-lunar";

export type { FestivalEffect, FestivalEntry, FestivalKind, FestivalRule } from "./festival-defaults";
export { DEFAULT_FESTIVALS, FESTIVAL_EFFECTS, FESTIVAL_KINDS } from "./festival-defaults";

/** 节日表存在 data/（gitignore、volume 持久化），可在工作台 /w/festivals 里改 */
const FILE = path.join(process.cwd(), "data", "festivals.json");

interface Store {
  at: string;
  /** 上次同步的放假安排年份 */
  year?: number;
  entries: FestivalEntry[];
}

/** 一条「正在进行中」的节日（含区间与进度） */
export interface ActiveFestival extends FestivalEntry {
  /** 本次命中的显示区间（含首尾） */
  start: string;
  end: string;
  /** 今天是第几天（从 1 起） */
  day: number;
  /** 一共几天 */
  total: number;
  /** 进度 0–1 */
  progress: number;
  /** true = 后台指定的预览（不是当天自动命中） */
  preview?: boolean;
}

/** 「下一个节日」用 */
export interface UpcomingFestival {
  entry: FestivalEntry;
  start: string;
  end: string;
  /** 还有几天开始 */
  inDays: number;
}

// ── 日期工具（本地时区） ─────────────────────────────────────────────

function dayKey(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function shiftDay(key: string, delta: number): string {
  const date = parseDay(key);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

/** 含首尾的天数（start..end） */
function spanDays(start: string, end: string): number {
  return Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86_400_000) + 1;
}

function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ── 数据读写 ────────────────────────────────────────────────────────

function sanitizeRule(value: unknown): FestivalRule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const type = raw.type === "lunar" ? "lunar" : "solar";
  const month = Number(raw.month);
  const day = Number(raw.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return undefined;
  return { type, month: Math.min(12, Math.max(1, Math.round(month))), day: Math.min(31, Math.max(1, Math.round(day))) };
}

const EFFECTS: FestivalEffect[] = ["emoji-fall", "snow", "confetti", "lantern", "spark", "petal", "none"];

function sanitizeEntry(value: unknown): FestivalEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (id === "" || !/^[a-z0-9-]{1,60}$/.test(id)) return null;
  const kind: FestivalKind =
    raw.kind === "minor" || raw.kind === "personal" ? raw.kind : "statutory";
  const effect = EFFECTS.includes(raw.effect as FestivalEffect) ? (raw.effect as FestivalEffect) : "emoji-fall";
  const days = Number(raw.days);
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : id,
    greeting: typeof raw.greeting === "string" ? raw.greeting.trim().slice(0, 40) : "",
    emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji.trim().slice(0, 8) : "🎉",
    color: /^#[0-9a-fA-F]{3,8}$/.test(String(raw.color ?? "")) ? String(raw.color) : "#e07a52",
    effect,
    kind,
    enabled: raw.enabled !== false,
    start: isDayKey(raw.start) ? raw.start : undefined,
    end: isDayKey(raw.end) ? raw.end : undefined,
    rule: sanitizeRule(raw.rule),
    days: Number.isFinite(days) ? Math.min(60, Math.max(1, Math.round(days))) : undefined,
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : undefined,
    source: raw.source === "holiday-cn" ? "holiday-cn" : raw.source === "manual" ? "manual" : undefined,
  };
}

/** 文件签名（mtime+size）：外部改了自动重载 */
let cache: { signature: string; store: Store } | null = null;

function signature(): string {
  try {
    const st = fs.statSync(FILE);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

/** 读取节日表；文件不存在/损坏时用默认表并落盘 */
export function readFestivals(): Store {
  const sig = signature();
  if (cache && cache.signature === sig) return cache.store;
  let store: Store | null = null;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
    const entries = Array.isArray(raw.entries)
      ? raw.entries.map(sanitizeEntry).filter((item): item is FestivalEntry => item !== null)
      : [];
    if (entries.length) {
      store = {
        at: typeof raw.at === "string" ? raw.at : new Date().toISOString(),
        year: Number.isFinite(Number(raw.year)) ? Number(raw.year) : undefined,
        entries,
      };
    }
  } catch {
    store = null;
  }
  if (!store) {
    store = { at: new Date().toISOString(), entries: DEFAULT_FESTIVALS.map((item) => ({ ...item })) };
    try {
      writeFestivals(store.entries, store.year);
    } catch {
      // 写不进去也不影响本次渲染
    }
  }
  cache = { signature: signature(), store };
  return store;
}

/** 整体写回（原子替换，无 BOM） */
export function writeFestivals(entries: FestivalEntry[], year?: number): Store {
  const store: Store = { at: new Date().toISOString(), year, entries };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, FILE);
  cache = { signature: signature(), store };
  return store;
}

export function invalidateFestivalCache(): void {
  cache = null;
}

// ── 区间与进度 ──────────────────────────────────────────────────────

interface Span {
  start: string;
  end: string;
}

/** 某一年里的候选区间（农历节日可能落在相邻公历年，故返回多个） */
function spansNear(entry: FestivalEntry, date: Date): Span[] {
  const days = Math.max(1, entry.days ?? 1);
  const out: Span[] = [];
  if (isDayKey(entry.start)) {
    const start = entry.start;
    const end = isDayKey(entry.end) ? entry.end : shiftDay(start, days - 1);
    // 固定区间只当「本次」，邻近 ±1 年也给出候选（跨年区间）
    for (const offset of [0, -1, 1]) {
      const s = shiftDay(start, offset * 365);
      out.push({ start: s, end: shiftDay(s, spanDays(start, end) - 1) });
    }
    return out;
  }
  const rule = entry.rule;
  if (!rule) return out;
  const lunarYear = solarToLunar(date).year;
  const years = rule.type === "lunar" ? [lunarYear - 1, lunarYear, lunarYear + 1] : [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1];
  for (const year of years) {
    let start: Date | null;
    if (rule.type === "lunar") {
      start = lunarToSolar(year, rule.month, rule.day);
    } else {
      start = new Date(year, rule.month - 1, rule.day);
    }
    if (!start || Number.isNaN(start.getTime())) continue;
    const s = dayKey(start);
    out.push({ start: s, end: shiftDay(s, days - 1) });
  }
  return out;
}

/** 今天是否落在该节日的区间里；命中则返回区间与进度 */
function hit(entry: FestivalEntry, date: Date): ActiveFestival | null {
  if (!entry.enabled) return null;
  const today = dayKey(date);
  for (const span of spansNear(entry, date)) {
    if (today < span.start || today > span.end) continue;
    const total = Math.max(1, spanDays(span.start, span.end));
    const day = Math.round((parseDay(today).getTime() - parseDay(span.start).getTime()) / 86_400_000) + 1;
    return { ...entry, start: span.start, end: span.end, day, total, progress: Math.min(1, day / total) };
  }
  return null;
}

const KIND_ORDER: FestivalKind[] = ["statutory", "minor", "personal"];

/** 今天正在过的节日（可能多个；法定的排前面） */
export function activeFestivals(date: Date = new Date()): ActiveFestival[] {
  const list: ActiveFestival[] = [];
  for (const entry of readFestivals().entries) {
    const found = hit(entry, date);
    if (found) list.push(found);
  }
  return list.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.total - a.total || a.name.localeCompare(b.name),
  );
}

export function festivalById(id: string): FestivalEntry | null {
  return readFestivals().entries.find((entry) => entry.id === id) ?? null;
}

export function allFestivals(): FestivalEntry[] {
  return readFestivals().entries;
}

/**
 * 当前该展示哪个节日：
 * - off：关闭
 * - auto：按日期自动识别
 * - 其它值：后台指定的节日 id（预览，离线日期也能看效果）
 */
export function resolveFestival(mode: string, date: Date = new Date()): ActiveFestival | null {
  if (mode === "off") return null;
  if (mode !== "auto") {
    const entry = festivalById(mode);
    if (!entry) return null;
    const span = spansNear(entry, date).find((item) => item.start >= shiftDay(dayKey(date), -180)) ?? spansNear(entry, date)[0];
    const total = span ? Math.max(1, spanDays(span.start, span.end)) : 1;
    return {
      ...entry,
      start: span?.start ?? dayKey(date),
      end: span?.end ?? dayKey(date),
      day: 1,
      total,
      progress: 1 / total,
      preview: !hit(entry, date),
    };
  }
  return activeFestivals(date)[0] ?? null;
}

/** 下一个节日（管理页/横幅用）：未来 400 天内最近的一个 */
export function upcomingFestival(date: Date = new Date()): UpcomingFestival | null {
  const today = dayKey(date);
  let best: UpcomingFestival | null = null;
  for (const entry of readFestivals().entries) {
    if (!entry.enabled) continue;
    for (const span of spansNear(entry, date)) {
      if (span.start <= today) continue;
      if (spanDays(today, span.start) > 400) continue;
      if (!best || span.start < best.start) {
        best = { entry, start: span.start, end: span.end, inDays: spanDays(today, span.start) - 1 };
      }
    }
  }
  return best;
}
