import fs from "node:fs";
import path from "node:path";
import type { LookupItem } from "./lookup";

/**
 * 立创识别结果缓存（长期）
 *
 * - 落地 `data/lookup-cache.json`（volume 持久化、不进 git、随备份走）
 * - 默认保留 90 天：参数、封装、数据手册这类信息几乎不变；
 *   价格与库存可能过期，命中缓存时接口会标记 `cached: true`，界面提示「来自缓存」
 * - 内存优先 + 写盘串行（tmp → rename），缓存读写失败绝不影响识别主流程
 * - 目的：重复查询不再请求立创，显著降低触发风控的概率
 */

const FILE = path.join(process.cwd(), "data", "lookup-cache.json");
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 800;
const VERSION = "v2";

export interface LookupCacheEntry {
  fetchedAt: number;
  /** 完整识别结果（按立创编号 / 商品 ID 缓存） */
  item?: LookupItem;
  /** 关键词搜索候选（按放宽后实际命中的词缓存） */
  items?: LookupItem[];
}

interface LookupCacheFile {
  version: number;
  entries: Record<string, LookupCacheEntry>;
}

let memory: Record<string, LookupCacheEntry> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function readAll(): Record<string, LookupCacheEntry> {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as LookupCacheFile;
    memory = parsed && typeof parsed.entries === "object" && parsed.entries ? parsed.entries : {};
  } catch {
    // 首次运行 / 文件损坏：从空缓存开始
    memory = {};
  }
  return memory;
}

function persist(entries: Record<string, LookupCacheEntry>): void {
  const snapshot: LookupCacheFile = { version: 1, entries };
  writeChain = writeChain.then(async () => {
    try {
      await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
      await fs.promises.writeFile(tmp, JSON.stringify(snapshot), "utf8");
      await fs.promises.rename(tmp, FILE);
    } catch {
      // 缓存写失败忽略，不影响识别
    }
  });
}

export const cacheKeyCode = (code: string): string => `${VERSION}:code:${code.toUpperCase()}`;
export const cacheKeyItem = (itemId: string): string => `${VERSION}:id:${itemId}`;
export const cacheKeySearch = (keyword: string): string =>
  `${VERSION}:search:${keyword.trim().toLowerCase()}`;

export function readCache(key: string): LookupCacheEntry | null {
  const entries = readAll();
  const entry = entries[key];
  if (!entry) return null;
  if (Date.now() - (entry.fetchedAt || 0) > TTL_MS) {
    delete entries[key];
    return null;
  }
  return entry;
}

export function writeCache(key: string, entry: Omit<LookupCacheEntry, "fetchedAt">): void {
  const entries = readAll();
  entries[key] = { ...entry, fetchedAt: Date.now() };
  const keys = Object.keys(entries);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (entries[a].fetchedAt || 0) - (entries[b].fetchedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((stale) => delete entries[stale]);
  }
  persist(entries);
}
