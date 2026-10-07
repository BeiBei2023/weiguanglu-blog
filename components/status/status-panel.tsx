"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { CountUp } from "@/components/w/metric-number";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Database,
  FileCheck2,
  HardDrive,
  History,
  MemoryStick,
  RefreshCw,
  Server,
  ShieldCheck,
  Thermometer,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DiskInfo, ProbeInfo, SysInfo } from "@/lib/sysinfo";
import { formatBytes, formatClock, formatAgo } from "@/lib/format";
import { tempTone, TEMP_WARN } from "@/lib/temp-tone";

const REFRESH_MS = 10_000;

function emptySubscribe(): () => void {
  return () => {};
}

function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}


function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return "—";
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分 ${Math.floor(sec % 60)} 秒`;
}



function untilText(iso: string | null, now: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, t - now);
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} 分钟后`;
  const hour = Math.floor(min / 60);
  const rest = min % 60;
  return `${hour} 小时 ${rest} 分后`;
}

function usageClass(percent: number): string {
  if (percent >= 0.9) return "bg-destructive";
  if (percent >= 0.75) return "bg-amber-500";
  if (percent >= 0.5) return "bg-primary/70";
  return "bg-emerald-500/80";
}

/** 温度文字色：≥ 危险阈值标红，≥ 告警阈值标黄 */
function tempTextClass(value: number | null | undefined): string {
  const tone = tempTone(value);
  if (tone === "danger") return "text-destructive";
  if (tone === "warn") return "text-amber-600 dark:text-amber-400";
  return "";
}

/** 温度条颜色 */
function tempBarClass(value: number | null | undefined): string {
  const tone = tempTone(value);
  if (tone === "danger") return "bg-destructive";
  if (tone === "warn") return "bg-amber-500";
  return "bg-emerald-500/80";
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  action,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-3xl p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </h2>
        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        ok ? "bg-emerald-500" : "bg-destructive",
      )}
    />
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-2 font-heading text-xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function DiskRow({ disk }: { disk: DiskInfo }) {
  if (!disk.ok) {
    return (
      <div className="rounded-2xl bg-accent/40 p-3">
        <p className="text-sm">{disk.label}</p>
        <p className="mt-1 text-xs text-destructive">读取失败：{disk.error ?? "未知错误"}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-accent/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">{disk.label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          已用 {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)} ·{" "}
          {(disk.percent * 100).toFixed(1)}%
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", usageClass(disk.percent))}
          style={{ width: `${Math.min(100, Math.max(2, disk.percent * 100))}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        剩余 {formatBytes(disk.freeBytes)} · <span className="font-mono">{disk.path}</span>
      </p>
    </div>
  );
}

function ProbeRow({ probe }: { probe: ProbeInfo }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-accent/40 px-3 py-2">
      <Dot ok={probe.ok} />
      <span className="text-sm">{probe.name}</span>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {probe.ok ? `${probe.ms} ms` : (probe.error ?? "不可达")}
      </span>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums">{value}</span>
    </div>
  );
}

export function StatusPanel({ initial }: { initial: SysInfo }) {
  const [info, setInfo] = useState<SysInfo>(initial);
  const [updatedAt, setUpdatedAt] = useState<string>(initial.now);
  const [refreshing, setRefreshing] = useState(false);
  const isClient = useIsClient();
  const now = useNow(1000);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/w/status/snapshot", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as SysInfo;
      setInfo(next);
      setUpdatedAt(new Date().toISOString());
    } catch {
      if (!silent) toast.error("读取失败，请稍后再试");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 只在标签页可见时轮询；从后台切回来立刻补刷一次
  useVisibleInterval(() => void refresh(true), REFRESH_MS);

  const { runtime, disks, probes, site, deploy, data, backup, content, warnings, extra, net, temps } = info;
  const memUsed = runtime.memTotalBytes - runtime.memFreeBytes;
  const memPercent = runtime.memTotalBytes > 0 ? memUsed / runtime.memTotalBytes : 0;
  const systemDisk = disks[0];
  const boardMax = temps.board.length > 0 ? Math.max(...temps.board) : null;

  // 「最近动静」：把已有的读数组装成一条时间轴（最新一条在最上面，CSS 会给它点亮橙点）
  const events: { key: string; time: string; subject: string; note: string; value?: string }[] = [];
  if (deploy.exists && deploy.updatedAt) {
    events.push({
      key: "deploy",
      time: formatClock(deploy.updatedAt),
      subject: "部署",
      note: "站点代码更新并重启容器",
    });
  }
  if (backup.status?.at) {
    events.push({
      key: "backup",
      time: formatClock(backup.status.at),
      subject: "备份",
      note: backup.status.ok === false ? "上次备份失败，建议看一眼日志" : "归档已上传到云盘",
      value: formatAgo(backup.status.at, now),
    });
  }
  for (const probe of probes) {
    if (probe.ok) continue;
    events.push({
      key: `probe-${probe.name}`,
      time: "—",
      subject: "端口探活",
      note: `${probe.name} 连不上：${probe.error ?? "未知原因"}`,
    });
  }
  if (systemDisk?.ok && systemDisk.percent >= 0.75) {
    events.push({
      key: "disk",
      time: "—",
      subject: "磁盘",
      note: `${systemDisk.label} 已用 ${(systemDisk.percent * 100).toFixed(0)}%，接近阈值`,
      value: `剩 ${formatBytes(systemDisk.freeBytes)}`,
    });
  }
  if (memPercent >= 0.85) {
    events.push({
      key: "mem",
      time: "—",
      subject: "内存",
      note: "内存占用偏高，留意容器是否被限",
      value: `${(memPercent * 100).toFixed(0)}%`,
    });
  }
  if (temps.max !== null && temps.max >= TEMP_WARN) {
    events.push({
      key: "temp",
      time: "—",
      subject: "温度",
      note:
        tempTone(temps.cpuPackage) !== "ok"
          ? "CPU 温度高于告警阈值，检查散热与风道"
          : "有传感器温度高于告警阈值",
      value: `${temps.cpuPackage !== null && temps.max === temps.cpuPackage ? temps.cpuPackage : temps.max}℃`,
    });
  }
  if (events.length === 0) {
    events.push({
      key: "ok",
      time: "—",
      subject: "一切正常",
      note: "没有需要处理的事件，磁盘、备份、端口都在正常范围",
    });
  }

  return (
    <>
      {warnings.length > 0 ? (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          {warnings.join("；")}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isClient ? `${formatAgo(updatedAt, now)}更新` : "刚刚更新"} · 每 10 秒自动刷新，也可以手动刷新
        </p>
        <Button type="button" size="sm" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 wgl-cells">
        <Metric
          icon={Wifi}
          label="站点自检"
          value={site.ok ? `${site.status ?? 200}` : "失败"}
          sub={`${site.url} · ${site.ms} ms`}
        />
        <Metric
          icon={HardDrive}
          label="系统盘"
          value={`${((systemDisk?.percent ?? 0) * 100).toFixed(0)}%`}
          sub={systemDisk?.ok ? `剩余 ${formatBytes(systemDisk.freeBytes)}` : "读取失败"}
        />
        <Metric
          icon={MemoryStick}
          label="内存"
          value={`${(memPercent * 100).toFixed(0)}%`}
          sub={`${formatBytes(memUsed)} / ${formatBytes(runtime.memTotalBytes)}`}
        />
        <Metric
          icon={Clock}
          label="容器运行"
          value={formatDuration(runtime.processUptimeSec)}
          sub={`宿主 ${formatDuration(runtime.hostUptimeSec)}`}
        />
      </div>

      <section className="glass overflow-hidden rounded-2xl">
        <div className="w-band wgl-cells">
          <div className="w-band-cell">
            <p className="band-label">系统盘</p>
            <p className={cn("band-value", (systemDisk?.percent ?? 0) >= 0.9 && "text-destructive")}>
              <CountUp text={`${((systemDisk?.percent ?? 0) * 100).toFixed(0)}%`} />
            </p>
            <p className="band-hint">
              {systemDisk?.ok ? `剩余 ${formatBytes(systemDisk.freeBytes)}` : "读取失败"}
            </p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">内存</p>
            <p className="band-value">
              <CountUp text={`${(memPercent * 100).toFixed(0)}%`} />
            </p>
            <p className="band-hint">
              {formatBytes(memUsed)} / {formatBytes(runtime.memTotalBytes)}
            </p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">备份</p>
            <p className={cn("band-value", backup.status?.ok === false && "text-destructive")}>
              {backup.status?.at ? formatAgo(backup.status.at, now) : "暂无"}
            </p>
            <p className="band-hint">
              下次 {backup.nextAt ? formatClock(backup.nextAt) : "待推算"}
              {backup.status?.ok === false ? " · 上次失败" : ""}
            </p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">容器运行</p>
            <p className="band-value">{formatDuration(runtime.processUptimeSec)}</p>
            <p className="band-hint">宿主 {formatDuration(runtime.hostUptimeSec)}</p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">CPU 温度</p>
            <p className={cn("band-value", tempTextClass(temps.cpuPackage))}>
              {temps.cpuPackage !== null ? `${temps.cpuPackage}℃` : "—"}
            </p>
            <p className="band-hint">
              {boardMax !== null ? `主板 ${boardMax}℃` : "主板 —"}
              {temps.diskMax !== null ? ` · 盘 ${temps.diskMax}℃` : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold">
            <Clock className="size-4 text-primary" />
            最近动静
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {isClient ? `${formatAgo(updatedAt, now)}更新` : "刚刚更新"}
          </span>
        </div>
        <ul className="w-timeline mt-2">
          {events.map((event) => (
            <li key={event.key}>
              <span className="tl-time tabular-nums">{event.time}</span>
              <span className="tl-body">
                <span className="tl-subject">{event.subject}</span>
                <span className="tl-note">{event.note}</span>
              </span>
              {event.value ? <span className="tl-value tabular-nums">{event.value}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <SectionCard
        icon={Server}
        title="运行概览"
        hint="容器内部视角；数据每 10 秒自动刷新"
        action={
          <>
            <span className="text-xs text-muted-foreground">
              {isClient ? `${formatAgo(updatedAt, now)}更新` : "刚刚更新"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              刷新
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 wgl-cells">
          <div>
            <KeyValue label="站点地址" value={site.url} />
            <KeyValue
              label="站点响应"
              value={site.ok ? `${site.status} · ${site.ms} ms` : `失败：${site.error ?? "未知"}`}
            />
            <KeyValue label="进程启动" value={formatClock(runtime.processStartedAt)} />
            <KeyValue label="Node / 平台" value={`${runtime.node} · ${runtime.platform}-${runtime.arch}`} />
            <KeyValue label="CPU 核数 / 负载" value={`${runtime.cpus} 核 · ${runtime.loadavg.map((v) => v.toFixed(2)).join(" / ")}`} />
            <KeyValue label="进程内存（RSS）" value={formatBytes(runtime.rssBytes)} />
            <KeyValue label="时区 / PID" value={`${runtime.timezone} · ${runtime.pid}`} />
          </div>
          <div>
            <KeyValue label="文章总数" value={`${content.posts} 篇（公开 ${content.publicPosts}）`} />
            <KeyValue label="图片 / 视频" value={`${content.images} 个 · ${formatBytes(content.imagesBytes)}`} />
            <KeyValue label="data/ 数据量" value={`${data.files} 个文件 · ${formatBytes(data.bytes)}`} />
            <KeyValue
              label="最近部署"
              value={deploy.exists ? `${formatClock(deploy.updatedAt)}` : "暂无记录"}
            />
            <KeyValue
              label="上次备份"
              value={backup.status?.at ? `${formatClock(backup.status.at)}${backup.status.ok === false ? "（失败）" : ""}` : "暂无记录"}
            />
            <KeyValue
              label="下次备份"
              value={`${formatClock(backup.nextAt)}（${untilText(backup.nextAt, now)}）`}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={HardDrive} title="磁盘" hint="用 statfs 从容器内读取，交叉核对宿主分区">
        <div className="space-y-3">
          {disks.map((disk) => (
            <DiskRow key={disk.path} disk={disk} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={Thermometer}
        title="温度"
        hint={
          temps.source === "hwmon"
            ? "CPU / 主板：容器内实时读宿主 /sys/class/hwmon；硬盘：最近一次 SMART 采样"
            : temps.source === "sample"
              ? "实时传感器不可用，取自最近一次主机采样"
              : "暂时读不到温度"
        }
      >
        {temps.source === "none" ? (
          <p className="text-xs text-muted-foreground">
            没读到温度。确认宿主机把 <code className="rounded bg-muted px-1 py-0.5">/sys/class/hwmon</code>{" "}
            只读挂进了容器（docker-compose.yml 的 volumes）。
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 wgl-cells">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CPU 封装</span>
                <span className={cn("font-medium tabular-nums", tempTextClass(temps.cpuPackage))}>
                  {temps.cpuPackage !== null ? `${temps.cpuPackage}℃` : "—"}
                </span>
              </div>
              {temps.cpuCores.length > 0 ? (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">CPU 各核心</span>
                  <span className="tabular-nums text-muted-foreground">
                    {temps.cpuCores.map((value) => `${value}℃`).join(" / ")}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">主板 / ACPI</span>
                <span className="tabular-nums text-muted-foreground">
                  {temps.board.length > 0 ? temps.board.map((value) => `${value}℃`).join(" / ") : "—"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                告警阈值 {TEMP_WARN}℃ · {temps.at ? `${formatAgo(temps.at, now)}更新` : "—"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">硬盘（SMART）</p>
              {temps.disks.length === 0 ? (
                <p className="text-xs text-muted-foreground">最近一次采样里没有硬盘温度</p>
              ) : (
                temps.disks.map((disk) => (
                  <div key={disk.dev} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate" title={disk.model}>
                        {disk.dev} · {disk.model}
                      </span>
                      <span className={cn("shrink-0 tabular-nums", tempTextClass(disk.temp))}>
                        {disk.temp !== null ? `${disk.temp}℃` : "—"}
                      </span>
                    </div>
                    {disk.temp !== null ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", tempBarClass(disk.temp))}
                          style={{ width: `${Math.min(100, Math.max(2, disk.temp))}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Cpu} title="资源" hint="容器进程与磁盘 inode 的使用情况">
        <div className="grid gap-4 sm:grid-cols-2 wgl-cells">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">CPU 使用率（瞬时采样）</span>
              <span className="tabular-nums">
                {(extra.cpuPercent ?? 0).toFixed(1)}% · {extra.cpus} 核
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">系统内存</span>
              <span className="tabular-nums">{(extra.memPercent * 100).toFixed(0)}% 已用</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Node 堆</span>
              <span className="tabular-nums">
                {formatBytes(extra.heapUsedBytes)} / {formatBytes(extra.heapTotalBytes)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">采集耗时</span>
              <span className="tabular-nums">{extra.ms} ms</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">磁盘 inode（小文件数量上限）</p>
            {extra.inodes.map((inode) => (
              <div key={inode.path} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" title={inode.path}>
                    {inode.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {inode.ok ? `${(inode.percent * 100).toFixed(0)}% · 剩余 ${inode.free}` : "读取失败"}
                  </span>
                </div>
                {inode.ok ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", usageClass(inode.percent))}
                      style={{ width: `${Math.min(100, Math.max(2, inode.percent * 100))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Activity} title="网络流量" hint="容器网卡累计（/proc/net/dev），只统计本站的收发">
        {net.ok ? (
          <div className="grid gap-4 sm:grid-cols-3 wgl-cells">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">今日（{net.day}）</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">接收 ↓</span>
                <span className="tabular-nums">{formatBytes(net.todayRxBytes)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">发送 ↑</span>
                <span className="tabular-nums">{formatBytes(net.todayTxBytes)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">自开始统计</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">接收 ↓</span>
                <span className="tabular-nums">{formatBytes(net.sinceRxBytes)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">发送 ↑</span>
                <span className="tabular-nums">{formatBytes(net.sinceTxBytes)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">当前速率</span>
                <span className="tabular-nums">
                  ↓ {formatBytes(net.rateRxBps)}/s · ↑ {formatBytes(net.rateTxBps)}/s
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">接口累计</p>
              {net.interfaces.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono">{item.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    ↓ {formatBytes(item.rxBytes)} · ↑ {formatBytes(item.txBytes)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-destructive">{net.error ?? "读取 /proc/net/dev 失败"}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          只统计容器（网站 / MQTT / 备份上传）的收发，宿主机上其它服务不算在内；速率是距上次采样的平均（页面每 10 秒刷新一次）。
        </p>
      </SectionCard>

      <SectionCard icon={Activity} title="端口探活" hint="从容器内 TCP 连接自己的监听端口">
        <div className="space-y-2">
          {probes.map((probe) => (
            <ProbeRow key={`${probe.host}-${probe.port}`} probe={probe} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          各模块的数据量（MQTT 在线 / OTA 固件 / 元器件仓库 / 阅读量）见{" "}
          <Link href="/w" className="text-primary hover:underline">
            工作台首页
          </Link>{" "}
          的指标卡。
        </p>
      </SectionCard>

      <SectionCard icon={FileCheck2} title="数据体检" hint="逐个解析 data/ 下的 JSON，并检查站点 HTTPS 证书">
        <div className="grid gap-4 sm:grid-cols-2 wgl-cells">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">data/ 下的 JSON 文件</p>
            {extra.json.length === 0 ? (
              <p className="text-xs text-muted-foreground">没有可检查的文件。</p>
            ) : (
              extra.json.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono" title={item.name}>
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-right",
                      item.ok ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    {item.ok
                      ? `${formatBytes(item.bytes)}${item.sanitized ? " · 含控制字符（已容错读取）" : ""}`
                      : `损坏：${item.error ?? "无法解析"}`}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">HTTPS 证书</p>
            {extra.cert ? (
              extra.cert.error ? (
                <p className="text-xs text-destructive">检查失败：{extra.cert.error}</p>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">域名</span>
                    <span className="truncate font-mono">{extra.cert.host}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">剩余天数</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        (extra.cert.daysLeft ?? 0) <= 14 && "text-destructive",
                      )}
                    >
                      {extra.cert.daysLeft} 天
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">到期时间</span>
                    <span className="tabular-nums">{extra.cert.validTo}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">签发者</span>
                    <span className="truncate">{extra.cert.issuer}</span>
                  </div>
                </div>
              )
            ) : (
              <p className="text-xs text-muted-foreground">没有配置 SITE_URL，跳过证书检查。</p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Database} title="内容与数据" hint="站点内容规模与各模块的数据量">
        <div className="grid gap-4 sm:grid-cols-3 wgl-cells">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">内容</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">文章</span>
              <span className="tabular-nums">{extra.content.posts} 篇</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">草稿 / 仅登录</span>
              <span className="tabular-nums">
                {extra.content.drafts} / {extra.content.loginOnly}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">标签 / 系列</span>
              <span className="tabular-nums">
                {extra.content.tags} / {extra.content.series}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">总字数</span>
              <span className="tabular-nums">{extra.content.words.toLocaleString("zh-CN")} 字</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">阅读</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">累计阅读</span>
              <span className="tabular-nums">{extra.views.total}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">今日 PV / UV</span>
              <span className="tabular-nums">
                {extra.views.todayPv} / {extra.views.todayUv}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">流水条数</span>
              <span className="tabular-nums">{extra.views.logCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">有阅读的文章</span>
              <span className="tabular-nums">{extra.views.articles} 篇</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">元器件仓库</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">容器 / 元件</span>
              <span className="tabular-nums">
                {extra.inventory.boxes} / {extra.inventory.components}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">低库存</span>
              <span className={cn("tabular-nums", extra.inventory.lowStock > 0 && "text-amber-600 dark:text-amber-400")}>
                {extra.inventory.lowStock} 条
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">停用记录</span>
              <span className="tabular-nums">{extra.inventory.disabled} 条</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">元件总量</span>
              <span className="tabular-nums">{extra.inventory.totalQuantity}</span>
            </div>
          </div>
        </div>
        {extra.bigImages.length > 0 ? (
          <div className="mt-4 space-y-1">
            <p className="text-xs text-muted-foreground">图片里体积最大的 5 个</p>
            {extra.bigImages.map((file) => (
              <div key={file.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatBytes(file.bytes)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={ShieldCheck}
        title="备份"
        hint={`${backup.script}（systemd 计划：${backup.schedule}）`}
      >
        {backup.status ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={backup.status.ok === false ? "destructive" : "outline"} className="text-[10px]">
                {backup.status.ok === false ? "上次失败" : "上次成功"}
              </Badge>
              <span>{formatClock(backup.status.at ?? null)}</span>
              <span className="text-xs text-muted-foreground">
                {backup.status.at ? `${formatAgo(backup.status.at, now)}` : ""}
                {typeof backup.status.durationMs === "number"
                  ? ` · 耗时 ${(backup.status.durationMs / 1000).toFixed(1)} 秒`
                  : ""}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                下次 {formatClock(backup.nextAt)}（{untilText(backup.nextAt, now)}）
              </span>
            </div>
            {backup.status.logTail ? (
              <pre className="max-h-40 overflow-auto rounded-2xl bg-muted/60 p-3 text-[11px] leading-relaxed">
                {backup.status.logTail}
              </pre>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            还没有备份状态文件（{backup.statusPath}）。下次备份跑完后会写入，用来显示「上次备份 + 结果 + 距下次」。
            计划：{backup.schedule}，下次 {formatClock(backup.nextAt)}（{untilText(backup.nextAt, now)}）。
          </p>
        )}
      </SectionCard>

      <SectionCard
        icon={History}
        title="最近部署"
        hint={deploy.exists ? `${deploy.path} · ${formatBytes(deploy.bytes)} · 更新于 ${formatClock(deploy.updatedAt)}` : "还没有部署记录"}
      >
        {deploy.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无记录</p>
        ) : (
          <pre className="max-h-56 overflow-auto rounded-2xl bg-muted/60 p-3 text-[11px] leading-relaxed">
            {deploy.lines.join("\n")}
          </pre>
        )}
      </SectionCard>

      <SectionCard
        icon={Cpu}
        title="data/ 文件"
        hint={`共 ${data.files} 个文件 · ${formatBytes(data.bytes)}（data/ 不进 git，随备份走）`}
      >
        {data.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无文件</p>
        ) : (
          <ul className="space-y-1">
            {data.items.slice(0, 20).map((item) => (
              <li
                key={item.name}
                className="flex items-baseline gap-2 border-b border-border/40 py-1.5 text-xs last:border-b-0"
              >
                <span className="truncate font-mono">{item.name}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                  {formatBytes(item.bytes)}
                </span>
                <span className="w-32 shrink-0 text-right tabular-nums text-muted-foreground/70">
                  {formatClock(item.updatedAt)}
                </span>
              </li>
            ))}
            {data.items.length > 20 ? (
              <li className="pt-1 text-xs text-muted-foreground">
                还有 {data.items.length - 20} 项未显示（完整清单见下方提示）
              </li>
            ) : null}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
