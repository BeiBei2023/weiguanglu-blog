import fs from "node:fs";
import path from "node:path";
import {
  LookupNotFoundError,
  LookupRateLimitError,
  lookup,
  type LookupItem,
} from "./lookup";

/**
 * 批量识别队列（离线慢慢抓，避免手点几百次）
 *
 * - 落地 `data/lookup-queue.json`（volume 持久化、不进 git）
 * - 客户端轮询 `step` 接口，每次只处理 1 条：配合 lookup 内的节流与退避，节奏温和
 * - 命中的结果会同时写进识别缓存，重复任务不再请求立创
 * - 被限流时保持 `pending` 并把提示放到 `message`，冷却结束可继续
 */

const FILE = path.join(process.cwd(), "data", "lookup-queue.json");
const MAX_ENTRIES = 300;

export interface LookupQueueEntry {
  query: string;
  status: "pending" | "ok" | "notfound" | "error";
  message?: string;
  item?: LookupItem;
}

export interface LookupQueue {
  createdAt: number;
  updatedAt: number;
  entries: LookupQueueEntry[];
}

let writeChain: Promise<void> = Promise.resolve();

function persist(queue: LookupQueue): void {
  const snapshot = queue;
  writeChain = writeChain.then(async () => {
    try {
      await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
      await fs.promises.writeFile(tmp, JSON.stringify(snapshot), "utf8");
      await fs.promises.rename(tmp, FILE);
    } catch {
      // 队列只是加速器，写失败忽略
    }
  });
}

export function readQueue(): LookupQueue | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as LookupQueue;
    return parsed && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

export function createQueue(queries: string[]): LookupQueue {
  const seen = new Set<string>();
  const entries: LookupQueueEntry[] = [];
  for (const raw of queries) {
    const query = raw.trim();
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ query, status: "pending" });
    if (entries.length >= MAX_ENTRIES) break;
  }
  const queue: LookupQueue = { createdAt: Date.now(), updatedAt: Date.now(), entries };
  persist(queue);
  return queue;
}

export function clearQueue(): LookupQueue {
  const queue: LookupQueue = { createdAt: Date.now(), updatedAt: Date.now(), entries: [] };
  persist(queue);
  return queue;
}

/** 处理下一条待识别（每次 1 条；限流时保持 pending 并回传提示） */
export async function stepQueue(): Promise<LookupQueue> {
  const queue = readQueue() ?? clearQueue();
  const entry = queue.entries.find((item) => item.status === "pending");
  if (!entry) return queue;
  try {
    const result = await lookup(entry.query);
    entry.status = "ok";
    entry.item = result.items[0];
    entry.message = result.matchedKeyword ? `按「${result.matchedKeyword}」匹配` : undefined;
  } catch (error) {
    if (error instanceof LookupNotFoundError) {
      entry.status = "notfound";
      entry.message = error.message;
    } else if (error instanceof LookupRateLimitError) {
      entry.message = error.message;
      queue.updatedAt = Date.now();
      persist(queue);
      return queue;
    } else {
      entry.status = "error";
      entry.message = error instanceof Error ? error.message : "识别失败";
    }
  }
  queue.updatedAt = Date.now();
  persist(queue);
  return queue;
}
