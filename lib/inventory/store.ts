import fs from "node:fs";
import path from "node:path";
import type { Low } from "lowdb";
import { JSONFilePreset } from "lowdb/node";
import { emptyInventory, sanitizeInventory, type InventoryData } from "./types";
import { backfillInventory } from "./fields";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "inventory.json");

let dbPromise: Promise<Low<InventoryData>> | null = null;

/** 文件损坏时先备份再重建，避免静默丢数据 */
function backupCorrupt(): void {
  try {
    if (!fs.existsSync(FILE)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.renameSync(FILE, `${FILE}.corrupt-${stamp}`);
  } catch {
    // 备份失败不阻塞恢复流程
  }
}

async function initDb(): Promise<Low<InventoryData>> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const db = await JSONFilePreset<InventoryData>(FILE, emptyInventory());
    db.data = backfillInventory(sanitizeInventory(db.data));
    return db;
  } catch {
    backupCorrupt();
    const db = await JSONFilePreset<InventoryData>(FILE, emptyInventory());
    db.data = backfillInventory(sanitizeInventory(db.data));
    return db;
  }
}

function getDb(): Promise<Low<InventoryData>> {
  dbPromise ??= initDb();
  return dbPromise;
}

async function refresh(db: Low<InventoryData>): Promise<void> {
  try {
    await db.read();
  } catch {
    backupCorrupt();
    db.data = emptyInventory();
  }
  db.data = backfillInventory(sanitizeInventory(db.data));
}

// 串行化读-改-写：避免并发写丢更新（lowdb 写本身原子）
let queue: Promise<unknown> = Promise.resolve();

export function mutate<T>(fn: (data: InventoryData) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await getDb();
    await refresh(db);
    const result = await fn(db.data);
    await db.write();
    return result;
  };
  const result = queue.then(run, run);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** 只读：每次从磁盘取最新内容（多实例/外部改动均可见） */
export async function readInventory(): Promise<InventoryData> {
  const db = await getDb();
  await refresh(db);
  return db.data;
}
