import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { Database, Flame, HardDrive, Radio, UploadCloud } from "lucide-react";
import { readHealthSamples } from "@/lib/health";
import { readHot } from "@/lib/hot";
import { formatAgo, formatBytes } from "@/lib/format";
import { cn } from "cn";
import { CountUp } from "@/components/w/metric-number";

/**
 * 机架读数条：挂在每个 /w 服务页顶部，和仪表台用同一套读数语言
 * （刻度轨 / 指示灯 / 等宽数字）。
 *
 * 只读本地文件（health.jsonl、backup-status.json、hot.json），
 * 不做任何探活，所以挂到每个页面都很便宜。
 */

interface BackupStatus {
  at?: string;
  ok?: boolean;
}

function readBackupStatus(): BackupStatus | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "backup-status.json"), "utf8")) as BackupStatus;
  } catch {
    return null;
  }
}

function Gauge({ ratio }: { ratio: number | null }) {
  const value = ratio === null ? null : ratio > 1 ? ratio / 100 : ratio;
  const filled = value === null ? 0 : Math.max(value > 0 ? 1 : 0, Math.round(value * 10));
  const tone = value !== null && value >= 0.9 ? "danger" : value !== null && value >= 0.75 ? "warn" : "ok";
  return (
    <>
      <span className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "wgl-gauge-seg h-3 w-[5px] rounded-[2px]",
              index < filled
                ? tone === "danger"
                  ? "bg-destructive"
                  : tone === "warn"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                : "bg-muted",
            )}
            style={{ animationDelay: `${index * 35}ms` }}
          />
        ))}
      </span>
      <span className="font-heading font-bold tabular-nums">
        {value === null ? "—" : <CountUp text={`${Math.round(value * 100)}%`} />}
      </span>
    </>
  );
}

export function WStatusStrip({ bare = false }: { bare?: boolean }) {
  const samples = readHealthSamples(1);
  const latest = samples[samples.length - 1] ?? null;
  const systemDisk = latest?.disks?.find((disk) => disk.mount === "/") ?? latest?.disks?.[0] ?? null;
  const dataDisk = latest?.disks?.find((disk) => disk.mount?.startsWith("/mnt/")) ?? null;
  const backup = readBackupStatus();
  const hot = readHot();
  const hotCount = hot?.sources?.reduce((sum, source) => sum + source.items.length, 0) ?? 0;
  const diskTemp = latest?.smart?.[0]?.temp;

  return (
    <div
      className={cn(
        "w-status-strip flex flex-wrap items-center gap-x-5 gap-y-2 text-xs",
        bare ? "px-1 py-1" : "glass rounded-2xl px-4 py-2.5",
      )}
    >
      <span className="flex items-center gap-2">
        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">系统盘</span>
        <Gauge ratio={systemDisk?.pct ?? null} />
      </span>

      {dataDisk ? (
        <span className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">数据盘</span>
          <Gauge ratio={dataDisk.pct ?? null} />
          <span className="hidden text-muted-foreground sm:inline">剩 {formatBytes(Math.max(0, dataDisk.avail ?? 0))}</span>
        </span>
      ) : null}

      <Link href="/w/status" className="flex items-center gap-2 transition-colors hover:text-primary">
        <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">备份</span>
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            backup === null ? "bg-muted-foreground" : backup.ok === false ? "bg-destructive" : "bg-emerald-500",
          )}
        />
        <span className="font-heading font-bold">{backup?.at ? formatAgo(backup.at) : "暂无记录"}</span>
      </Link>

      <Link href="/w/hot" className="flex items-center gap-2 transition-colors hover:text-primary">
        <Flame className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">热点</span>
        <span className="font-heading font-bold">
          <CountUp text={`${hotCount} 条`} />
        </span>
      </Link>

      <span className="ml-auto hidden items-center gap-2 sm:flex">
        <Radio className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">采样</span>
        <span className="font-heading font-bold tabular-nums">
          {latest?.at ? formatAgo(latest.at) : "—"}
          {typeof diskTemp === "number" ? ` · ${diskTemp}°C` : ""}
        </span>
      </span>
    </div>
  );
}
