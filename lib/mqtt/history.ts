import fs from "node:fs";
import path from "node:path";
import { readMqttConfig } from "./store";

/**
 * MQTT 数值历史：把遥测里的数字记下来画曲线。
 * 每主题保留最近 N 个点（默认 240，可在设置里改）；整体落盘 data/mqtt-history.json（防抖写，重启不丢）。
 */

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "mqtt-history.json");

export const MAX_POINTS = 240;
const FALLBACK_TOPICS = 40;
const SAVE_DEBOUNCE_MS = 5000;

/** 当前生效的保留策略（来自 data/mqtt.json，改动即时生效） */
function caps(): { points: number; topics: number } {
  try {
    const config = readMqttConfig();
    return { points: config.historyPoints, topics: config.historyTopics };
  } catch {
    return { points: MAX_POINTS, topics: FALLBACK_TOPICS };
  }
}

export interface HistoryPoint {
  /** epoch 毫秒 */
  t: number;
  v: number;
}

export interface HistoryTopic {
  topic: string;
  count: number;
  last: HistoryPoint;
  /** 取到的数值字段（如 v / temp），纯数字载荷为 null */
  field: string | null;
}

const globalRef = globalThis as unknown as {
  __wglMqttHistory?: {
    map: Map<string, HistoryPoint[]>;
    fields: Map<string, string | null>;
    loaded: boolean;
    dirty: boolean;
    timer: NodeJS.Timeout | null;
  };
};

function state() {
  globalRef.__wglMqttHistory ??= {
    map: new Map(),
    fields: new Map(),
    loaded: false,
    dirty: false,
    timer: null,
  };
  return globalRef.__wglMqttHistory;
}

function load(): void {
  const s = state();
  if (s.loaded) return;
  s.loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, HistoryPoint[]>;
    for (const [topic, points] of Object.entries(parsed)) {
      if (!Array.isArray(points)) continue;
      s.map.set(
        topic,
        points
          .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.v))
          .slice(-caps().points),
      );
    }
  } catch {
    // 首次运行或文件损坏：从空开始
  }
}

function writeNow(): void {
  const s = state();
  s.dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const out: Record<string, HistoryPoint[]> = {};
    for (const [topic, points] of s.map) out[topic] = points;
    const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(out)}\n`, "utf8");
    fs.renameSync(tmp, FILE);
  } catch {
    // 落盘失败不影响 broker
  }
}

function scheduleSave(): void {
  const s = state();
  s.dirty = true;
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    if (s.dirty) writeNow();
  }, SAVE_DEBOUNCE_MS);
  s.timer.unref?.();
}

const PREFERRED_FIELDS = [
  "v",
  "value",
  "val",
  "temp",
  "temperature",
  "hum",
  "humidity",
  "rssi",
  "volt",
  "voltage",
  "current",
  "power",
  "press",
  "pressure",
  "co2",
  "pm25",
  "lux",
  "level",
];

/** 从载荷里抠出一个数字：纯数字 → 直接用；JSON → 优先常见字段，其次第一个数字字段 */
export function extractNumber(payload: string): { value: number; field: string | null } | null {
  const text = payload.trim();
  if (!text) return null;
  const direct = Number(text);
  if (Number.isFinite(direct)) return { value: direct, field: null };
  if (text[0] !== "{") return null;
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return null;
    for (const key of PREFERRED_FIELDS) {
      const candidate = obj[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return { value: candidate, field: key };
      }
    }
    for (const [key, candidate] of Object.entries(obj)) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return { value: candidate, field: key };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** 记录一个数值点（非数值载荷会被忽略） */
export function recordMqttValue(topic: string, payload: string, at: number = Date.now()): boolean {
  const parsed = extractNumber(payload);
  if (!parsed) return false;
  load();
  const s = state();
  let points = s.map.get(topic);
  if (!points) {
    if (s.map.size >= caps().topics) {
      // 超出主题上限：丢掉最旧的那个主题
      let oldestTopic: string | null = null;
      let oldestAt = Infinity;
      for (const [key, value] of s.map) {
        const last = value.at(-1)?.t ?? 0;
        if (last < oldestAt) {
          oldestAt = last;
          oldestTopic = key;
        }
      }
      if (oldestTopic) {
        s.map.delete(oldestTopic);
        s.fields.delete(oldestTopic);
      }
    }
    points = [];
    s.map.set(topic, points);
  }
  const limit = caps().points;
  points.push({ t: at, v: parsed.value });
  if (points.length > limit) points.splice(0, points.length - limit);
  s.fields.set(topic, parsed.field);
  scheduleSave();
  return true;
}

export function mqttHistoryTopics(): HistoryTopic[] {
  load();
  const s = state();
  return [...s.map.entries()]
    .map(([topic, points]) => ({
      topic,
      count: points.length,
      last: points[points.length - 1],
      field: s.fields.get(topic) ?? null,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.last.t - a.last.t);
}

export function mqttHistory(topic: string): HistoryPoint[] {
  load();
  return [...(state().map.get(topic) ?? [])];
}

/** 面板预览用：最近 N 个主题各自最后 perTopic 个点（给设备卡画迷你曲线） */
export function mqttHistoryPreview(
  perTopic = 24,
  maxTopics = 12,
): Record<string, HistoryPoint[]> {
  load();
  const s = state();
  const out: Record<string, HistoryPoint[]> = {};
  const topics = [...s.map.entries()]
    .map(([topic, points]) => ({ topic, last: points.at(-1)?.t ?? 0, points }))
    .sort((a, b) => b.last - a.last)
    .slice(0, maxTopics);
  for (const item of topics) {
    const points = item.points.slice(-perTopic);
    if (points.length >= 2) out[item.topic] = points;
  }
  return out;
}

/** 清空全部历史 */
export function clearMqttHistory(): void {
  load();
  const s = state();
  s.map.clear();
  s.fields.clear();
  writeNow();
}
