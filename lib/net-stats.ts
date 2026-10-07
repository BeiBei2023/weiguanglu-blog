import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "net-stats.json");
const PROC_NET_DEV = "/proc/net/dev";

export interface NetInterface {
  name: string;
  rxBytes: number;
  txBytes: number;
}

export interface NetStats {
  ok: boolean;
  error?: string;
  /** 统计日期（北京时间 YYYY-MM-DD） */
  day: string;
  /** 今日接收 / 发送（字节） */
  todayRxBytes: number;
  todayTxBytes: number;
  /** 自开始统计以来的累计（字节） */
  sinceRxBytes: number;
  sinceTxBytes: number;
  /** 内核累计计数器（容器启动以来） */
  totalRxBytes: number;
  totalTxBytes: number;
  /** 距上次采样的平均速率（字节/秒） */
  rateRxBps: number;
  rateTxBps: number;
  lastAt: string | null;
  interfaces: NetInterface[];
  sampledAt: string;
}

interface Stored {
  day: string;
  rxBase: number;
  txBase: number;
  sinceRxBase: number;
  sinceTxBase: number;
  lastRx: number;
  lastTx: number;
  lastAt: string | null;
}

/** 显式按北京时间取日期，避免容器时区差异 */
function dayKey(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** 解析 /proc/net/dev（容器 netns 内的网卡累计计数） */
function readInterfaces(): NetInterface[] {
  const text = fs.readFileSync(PROC_NET_DEV, "utf8");
  const out: NetInterface[] = [];
  for (const line of text.split("\n").slice(2)) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    const name = line.slice(0, index).trim();
    const cols = line.slice(index + 1).trim().split(/\s+/);
    const rxBytes = Number(cols[0]);
    const txBytes = Number(cols[8]);
    if (!name || !Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
    out.push({ name, rxBytes, txBytes });
  }
  return out;
}

function readStored(): Stored | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<Stored>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.day !== "string") return null;
    return {
      day: parsed.day,
      rxBase: Number(parsed.rxBase) || 0,
      txBase: Number(parsed.txBase) || 0,
      sinceRxBase: Number(parsed.sinceRxBase) || 0,
      sinceTxBase: Number(parsed.sinceTxBase) || 0,
      lastRx: Number(parsed.lastRx) || 0,
      lastTx: Number(parsed.lastTx) || 0,
      lastAt: typeof parsed.lastAt === "string" ? parsed.lastAt : null,
    };
  } catch {
    return null;
  }
}

function writeStored(data: Stored): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, FILE);
  } catch {
    // 写失败不影响本次读取
  }
}

/**
 * 读取容器网卡的累计流量，并累计出「今日 / 自统计以来」的用量与瞬时速率。
 * 计数器归零（容器重启）或跨天时自动重置基准。
 */
export function netStats(): NetStats {
  const sampledAt = new Date().toISOString();
  try {
    const interfaces = readInterfaces();
    const totalRxBytes = interfaces.reduce((sum, item) => sum + item.rxBytes, 0);
    const totalTxBytes = interfaces.reduce((sum, item) => sum + item.txBytes, 0);
    const prev = readStored();
    const day = dayKey();

    // 容器重启后内核计数器归零 → 以当前值作基准；跨天则重置「今日」基准
    const reset = !prev || totalRxBytes < prev.lastRx || totalTxBytes < prev.lastTx;
    const newDay = !prev || prev.day !== day;

    const stored: Stored = {
      day,
      rxBase: reset || newDay ? totalRxBytes : prev.rxBase,
      txBase: reset || newDay ? totalTxBytes : prev.txBase,
      sinceRxBase: reset ? totalRxBytes : prev.sinceRxBase,
      sinceTxBase: reset ? totalTxBytes : prev.sinceTxBase,
      lastRx: totalRxBytes,
      lastTx: totalTxBytes,
      lastAt: sampledAt,
    };
    writeStored(stored);

    let rateRxBps = 0;
    let rateTxBps = 0;
    if (prev && !reset && prev.lastAt) {
      const elapsedSec = Math.max(0.001, (Date.now() - Date.parse(prev.lastAt)) / 1000);
      rateRxBps = Math.max(0, totalRxBytes - prev.lastRx) / elapsedSec;
      rateTxBps = Math.max(0, totalTxBytes - prev.lastTx) / elapsedSec;
    }

    return {
      ok: true,
      day,
      todayRxBytes: Math.max(0, totalRxBytes - stored.rxBase),
      todayTxBytes: Math.max(0, totalTxBytes - stored.txBase),
      sinceRxBytes: Math.max(0, totalRxBytes - stored.sinceRxBase),
      sinceTxBytes: Math.max(0, totalTxBytes - stored.sinceTxBase),
      totalRxBytes,
      totalTxBytes,
      rateRxBps,
      rateTxBps,
      lastAt: prev?.lastAt ?? null,
      interfaces,
      sampledAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      day: dayKey(),
      todayRxBytes: 0,
      todayTxBytes: 0,
      sinceRxBytes: 0,
      sinceTxBytes: 0,
      totalRxBytes: 0,
      totalTxBytes: 0,
      rateRxBps: 0,
      rateTxBps: 0,
      lastAt: null,
      interfaces: [],
      sampledAt,
    };
  }
}
