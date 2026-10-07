import fs from "node:fs";
import path from "node:path";

import { readHealthSamples } from "./health";

/**
 * 温度读取。
 *
 * - CPU / 主板：容器内**实时**读 `/sys/class/hwmon`（宿主机该目录以只读方式挂进容器）。
 * - 硬盘：复用主机侧 SMART 采样（`data/health.jsonl` 最新一条的 `smart[].temp`）。
 *
 * 拿不到 hwmon（比如本地开发机 / 未挂载）时，自动退回最近一次采样里的 `temps`。
 */

export {
  TEMP_DANGER,
  TEMP_WARN,
  tempTone,
  type TempTone,
} from "./temp-tone";

export interface TempDisk {
  dev: string;
  model: string;
  temp: number | null;
}

export interface TemperatureReading {
  /** hwmon=容器内实时读到；sample=退回最近一次采样；none=都没读到 */
  source: "hwmon" | "sample" | "none";
  /** 采样时间（source=sample 时有意义；hwmon 为读取时刻） */
  at: string | null;
  cpuPackage: number | null;
  cpuCores: number[];
  board: number[];
  disks: TempDisk[];
  diskMax: number | null;
  /** 所有读数里的最高值（含硬盘） */
  max: number | null;
}

const HWMON_DIR = "/sys/class/hwmon";
const CPU_CHIPS = ["coretemp", "k10temp", "cpu_thermal", "zenpower"];

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

interface HwmonTemps {
  cpuPackage: number | null;
  cpuCores: number[];
  board: number[];
}

function collectHwmon(): HwmonTemps | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(HWMON_DIR).sort();
  } catch {
    return null;
  }

  let cpuPackage: number | null = null;
  const cpuCores: number[] = [];
  const board: number[] = [];

  for (const entry of entries) {
    const base = path.join(HWMON_DIR, entry);
    const name = readText(path.join(base, "name"));
    if (!name || name.startsWith("nvme")) continue; // 硬盘温度走 SMART，别混进主板

    let files: string[];
    try {
      files = fs.readdirSync(base).sort();
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.startsWith("temp") || !file.endsWith("_input")) continue;
      const index = file.slice("temp".length, -"_input".length);
      const raw = Number.parseInt(readText(path.join(base, file)), 10);
      if (!Number.isFinite(raw)) continue;
      const celsius = Math.round(raw / 100) / 10;

      if (CPU_CHIPS.includes(name)) {
        const label = readText(path.join(base, `temp${index}_label`)).toLowerCase();
        const isPackage = !label || label.includes("package") || label.includes("tctl") || label.includes("tdie");
        if (isPackage) {
          if (cpuPackage === null) cpuPackage = celsius;
        } else {
          cpuCores.push(celsius);
        }
      } else {
        board.push(celsius);
      }
    }
  }

  if (cpuPackage === null && cpuCores.length === 0 && board.length === 0) return null;
  return { cpuPackage, cpuCores, board };
}

/** 读当前温度（容器内实时优先，退回最近采样） */
export function readTemps(): TemperatureReading {
  const samples = readHealthSamples(1);
  const sample = samples.length > 0 ? samples[samples.length - 1] : null;

  const disks: TempDisk[] = (sample?.smart ?? []).map((disk) => ({
    dev: disk.dev,
    model: disk.model ?? disk.dev,
    temp: typeof disk.temp === "number" ? disk.temp : null,
  }));
  const diskMax = disks.reduce<number | null>(
    (acc, disk) => (disk.temp !== null && (acc === null || disk.temp > acc) ? disk.temp : acc),
    null,
  );

  const hwmon = collectHwmon();
  let source: TemperatureReading["source"] = "none";
  let cpuPackage: number | null = null;
  let cpuCores: number[] = [];
  let board: number[] = [];

  if (hwmon) {
    source = "hwmon";
    cpuPackage = hwmon.cpuPackage;
    cpuCores = hwmon.cpuCores;
    board = hwmon.board;
  } else if (sample?.temps) {
    source = "sample";
    cpuPackage = sample.temps.cpuPackage ?? null;
    cpuCores = sample.temps.cpuCores ?? [];
    board = sample.temps.board ?? [];
  }

  const values = [cpuPackage, ...cpuCores, ...board, diskMax].filter(
    (value): value is number => typeof value === "number",
  );
  const max = values.length > 0 ? Math.max(...values) : null;

  return {
    source,
    at: source === "hwmon" ? new Date().toISOString() : (sample?.at ?? null),
    cpuPackage,
    cpuCores,
    board,
    disks,
    diskMax,
    max,
  };
}
