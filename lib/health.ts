import fs from "node:fs";
import path from "node:path";

/** `data/health.jsonl`（由主机侧 `deploy/health-sample.py` 每小时追加一行） */

export interface HealthDisk {
  mount: string;
  size: number;
  used: number;
  avail: number;
  pct: number;
}

export interface HealthSmart {
  dev: string;
  /** 稳定标识（序列号优先）：重启后 sdX 字母互换也不影响趋势 */
  key: string;
  model?: string;
  serial?: string;
  passed?: boolean;
  temp?: number;
  hours?: number;
  realloc?: number;
  pending?: number;
  crc?: number;
}

export interface HealthSample {
  at: string;
  load?: number[];
  uptime?: number;
  memTotal?: number;
  memAvailable?: number;
  disks?: HealthDisk[];
  smart?: HealthSmart[];
  /** CPU / 主板温度（摄氏度，由主机侧读 /sys/class/hwmon） */
  temps?: HealthTemps;
  backup?: { ok?: boolean; at?: string };
}

export interface HealthTemps {
  /** CPU 封装温度（coretemp 的 Package id 0 / k10temp 的 Tctl） */
  cpuPackage?: number;
  /** 各物理核心温度 */
  cpuCores?: number[];
  /** 主板 / ACPI 分区温度 */
  board?: number[];
}

const FILE = path.join(process.cwd(), "data", "health.jsonl");

/** 读最近 max 条采样（按时间升序）；文件不存在 / 某行坏掉都不影响其它行 */
export function readHealthSamples(max = 3000): HealthSample[] {
  let lines: string[];
  try {
    lines = fs.readFileSync(FILE, "utf8").split("\n").filter((line) => line.trim() !== "");
  } catch {
    return [];
  }
  const samples: HealthSample[] = [];
  for (const line of lines.slice(-max)) {
    try {
      const parsed = JSON.parse(line) as HealthSample;
      if (parsed && typeof parsed.at === "string") samples.push(parsed);
    } catch {
      // 忽略坏行
    }
  }
  return samples;
}
