"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { formatAgo, formatBytes, formatClock } from "@/lib/format";
import type { HealthSample } from "@/lib/health";
import { tempTone } from "@/lib/temp-tone";

/** 温度文字色：超阈值标黄 / 标红 */
function tempClass(value: number | undefined): string {
  const tone = tempTone(value);
  if (tone === "danger") return "text-destructive";
  if (tone === "warn") return "text-amber-600 dark:text-amber-400";
  return "";
}

const RANGES = [
  { id: "24h", label: "24 小时", hours: 24 },
  { id: "7d", label: "7 天", hours: 24 * 7 },
  { id: "30d", label: "30 天", hours: 24 * 30 },
  { id: "all", label: "全部", hours: 0 },
];

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626"];

type Row = Record<string, number | string>;

interface Series {
  key: string;
  name: string;
  color: string;
}

export function HealthPanel({ samples }: { samples: HealthSample[] }) {
  const [range, setRange] = useState("7d");
  const hours = RANGES.find((item) => item.id === range)?.hours ?? 0;

  const latestAt = samples.length ? new Date(samples[samples.length - 1].at).getTime() : 0;
  const visible = useMemo(() => {
    if (!hours || !latestAt) return samples;
    // 用「最新采样点的时间」当 now（纯函数，不在 render 里读时钟）
    const cutoff = latestAt - hours * 3600 * 1000;
    return samples.filter((sample) => new Date(sample.at).getTime() >= cutoff);
  }, [samples, hours, latestAt]);

  const rows = useMemo<Row[]>(
    () =>
      visible.map((sample) => {
        const row: Row = { at: sample.at };
        row.load1 = sample.load?.[0] ?? 0;
        row.load5 = sample.load?.[1] ?? 0;
        if (sample.memTotal) {
          const used = sample.memTotal - (sample.memAvailable ?? sample.memTotal);
          row.memPct = Math.round((used / sample.memTotal) * 1000) / 10;
        }
        for (const disk of sample.disks ?? []) row[`disk:${disk.mount}`] = disk.pct;
        for (const disk of sample.smart ?? []) {
          if (disk.temp !== undefined) row[`temp:${disk.key}`] = disk.temp;
          row[`bad:${disk.key}`] = (disk.realloc ?? 0) + (disk.pending ?? 0);
          if (disk.crc !== undefined) row[`crc:${disk.key}`] = disk.crc;
        }
        if (sample.temps?.cpuPackage !== undefined) row["temp:cpu"] = sample.temps.cpuPackage;
        (sample.temps?.board ?? []).forEach((value, index) => {
          row[`temp:board:${index}`] = value;
        });
        return row;
      }),
    [visible],
  );

  const mounts = useMemo(
    () => Array.from(new Set(visible.flatMap((s) => (s.disks ?? []).map((d) => d.mount)))),
    [visible],
  );

  const disks = useMemo(() => {
    const map = new Map<string, string>();
    for (const sample of visible) {
      for (const disk of sample.smart ?? []) map.set(disk.key, disk.model || disk.dev);
    }
    return Array.from(map.entries());
  }, [visible]);

  const latest = samples[samples.length - 1];

  const loadSeries: Series[] = [
    { key: "load1", name: "负载 (1 分钟)", color: COLORS[0] },
    { key: "load5", name: "负载 (5 分钟)", color: COLORS[1] },
    { key: "memPct", name: "内存占用 %", color: COLORS[2] },
  ];
  const diskSeries: Series[] = mounts.map((mount, index) => ({
    key: `disk:${mount}`,
    name: mount,
    color: COLORS[index % COLORS.length],
  }));
  const tempSeries: Series[] = disks.map(([key, label], index) => ({
    key: `temp:${key}`,
    name: label,
    color: COLORS[index % COLORS.length],
  }));
  const boardTemps = latest?.temps?.board ?? [];
  const cpuTempSeries: Series[] = [
    ...(latest?.temps?.cpuPackage !== undefined
      ? [{ key: "temp:cpu", name: "CPU 封装", color: COLORS[5] }]
      : []),
    ...boardTemps.map((_, index) => ({
      key: `temp:board:${index}`,
      name: `主板 ${index + 1}`,
      color: COLORS[index % COLORS.length],
    })),
  ];
  const smartSeries: Series[] = [
    ...disks.map(([key, label], index) => ({
      key: `crc:${key}`,
      name: `${label} · CRC`,
      color: COLORS[index % COLORS.length],
    })),
    ...disks.map(([key, label], index) => ({
      key: `bad:${key}`,
      name: `${label} · 重映射+待映射`,
      color: COLORS[(index + 3) % COLORS.length],
    })),
  ];

  const memPct = latest?.memTotal
    ? Math.round(((latest.memTotal - (latest.memAvailable ?? latest.memTotal)) / latest.memTotal) * 100)
    : null;

  const maxTemp = useMemo(() => {
    const temps = (latest?.smart ?? [])
      .map((disk) => disk.temp)
      .filter((temp): temp is number => typeof temp === "number");
    return temps.length ? Math.max(...temps) : null;
  }, [latest]);

  return (
    <div className="space-y-4">
      <div className="glass overflow-hidden rounded-2xl">
        <div className="w-band wgl-cells">
          <div className="w-band-cell">
            <p className="band-label">采样</p>
            <p className="band-value">{samples.length}</p>
            <p className="band-hint">{latest ? `最近 ${formatAgo(latest.at)}` : "还没有采样"}</p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">CPU 负载</p>
            <p className="band-value">{latest?.load?.[0]?.toFixed(2) ?? "-"}</p>
            <p className="band-hint">
              5 分 {latest?.load?.[1]?.toFixed(2) ?? "-"} · 15 分 {latest?.load?.[2]?.toFixed(2) ?? "-"}
            </p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">内存占用</p>
            <p className="band-value">{memPct !== null ? `${memPct}%` : "-"}</p>
            <p className="band-hint">
              {latest?.memTotal
                ? `可用 ${formatBytes(latest.memAvailable ?? 0)} / 共 ${formatBytes(latest.memTotal)}`
                : ""}
            </p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">最高盘温</p>
            <p className="band-value">{maxTemp !== null ? `${maxTemp}°C` : "-"}</p>
            <p className="band-hint">{(latest?.smart ?? []).length} 块盘 · SMART 计数见下方曲线</p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">CPU 温度</p>
            <p className={`band-value ${tempClass(latest?.temps?.cpuPackage)}`}>
              {latest?.temps?.cpuPackage !== undefined ? `${latest.temps.cpuPackage}°C` : "-"}
            </p>
            <p className="band-hint">
              {boardTemps.length > 0 ? `主板 ${Math.max(...boardTemps)}°C` : "主板 -"}
            </p>
          </div>
          <div className="w-band-cell">
            <p className="band-label">最近备份</p>
            <p className={`band-value ${latest?.backup?.ok === false ? "text-destructive" : ""}`}>
              {latest?.backup ? (latest.backup.ok ? "成功" : "失败") : "-"}
            </p>
            <p className="band-hint">{latest?.backup?.at ? formatAgo(latest.backup.at) : "还没记录"}</p>
          </div>
        </div>
      </div>

      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5">
        {RANGES.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={item.id === range ? "default" : "outline"}
            onClick={() => setRange(item.id)}
          >
            {item.label}
          </Button>
        ))}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          当前区间 {visible.length} 个采样点
          {latest ? ` · 最近 ${formatAgo(latest.at)}` : ""}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 wgl-cells">
        <Card title="磁盘占用">
          <ul className="space-y-0.5 text-xs">
            {(latest?.disks ?? []).map((disk) => (
              <li key={disk.mount} className="flex items-center justify-between gap-2">
                <span className="truncate tabular-nums text-[11px] text-muted-foreground">
                  {disk.mount}
                </span>
                <span className={disk.pct >= 90 ? "text-destructive" : ""}>
                  {disk.pct}%（{formatBytes(disk.used)}）
                </span>
              </li>
            ))}
            {!latest?.disks?.length ? <li className="text-muted-foreground">没有数据</li> : null}
          </ul>
        </Card>
      </div>

      <ChartCard title="CPU 负载与内存" rows={rows} series={loadSeries} />
      <ChartCard title="磁盘占用" rows={rows} series={diskSeries} unit="%" />
      <ChartCard title="CPU / 主板温度" rows={rows} series={cpuTempSeries} unit="°C" />
      <ChartCard title="硬盘温度" rows={rows} series={tempSeries} unit="°C" />
      <ChartCard
        title="SMART 累计计数（越低越好；只增不减就要留意）"
        rows={rows}
        series={smartSeries}
      />

      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold">硬盘 SMART 明细（最近一次）</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1.5 pr-3 font-medium">盘</th>
                <th className="py-1.5 pr-3 font-medium">型号</th>
                <th className="py-1.5 pr-3 font-medium">健康</th>
                <th className="py-1.5 pr-3 font-medium">温度</th>
                <th className="py-1.5 pr-3 font-medium">通电</th>
                <th className="py-1.5 pr-3 font-medium">重映射</th>
                <th className="py-1.5 pr-3 font-medium">待映射</th>
                <th className="py-1.5 pr-3 font-medium">CRC</th>
              </tr>
            </thead>
            <tbody>
              {(latest?.smart ?? []).map((disk) => (
                <tr key={disk.key} className="border-t border-border/50">
                  <td className="py-1.5 pr-3 font-mono">{disk.dev}</td>
                  <td className="py-1.5 pr-3">{disk.model || "-"}</td>
                  <td
                    className={
                      disk.passed ? "py-1.5 pr-3 text-emerald-600" : "py-1.5 pr-3 text-destructive"
                    }
                  >
                    {disk.passed ? "PASSED" : "注意"}
                  </td>
                  <td className="py-1.5 pr-3">{disk.temp !== undefined ? `${disk.temp}°C` : "-"}</td>
                  <td className="py-1.5 pr-3">
                    {disk.hours !== undefined ? `${disk.hours} h` : "-"}
                  </td>
                  <td className={disk.realloc ? "py-1.5 pr-3 text-amber-600" : "py-1.5 pr-3"}>
                    {disk.realloc ?? "-"}
                  </td>
                  <td className={disk.pending ? "py-1.5 pr-3 text-destructive" : "py-1.5 pr-3"}>
                    {disk.pending ?? "-"}
                  </td>
                  <td className={disk.crc ? "py-1.5 pr-3 text-amber-600" : "py-1.5 pr-3"}>
                    {disk.crc ?? "-"}
                  </td>
                </tr>
              ))}
              {!latest?.smart?.length ? (
                <tr>
                  <td colSpan={8} className="py-3 text-muted-foreground">
                    没有 SMART 数据（采样器需要 root 才能读 SMART）
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          CRC 增长通常意味着 <span className="font-mono">SATA 线 / 接口</span> 的传输错误（换线换口就能验证）；
          重映射 / 待映射增长才是盘体本身老化的信号。
        </p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ChartCard({
  title,
  rows,
  series,
  unit,
}: {
  title: string;
  rows: Row[];
  series: Series[];
  unit?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {series.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">没有数据</span>
        ) : null}
      </div>
      <div className="mt-3 h-[220px]">
        {rows.length > 1 && series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="at"
                tick={{ fontSize: 11 }}
                minTickGap={48}
                tickFormatter={(value) => formatClock(String(value))}
              />
              <YAxis tick={{ fontSize: 11 }} unit={unit} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(value) => formatClock(String(value))}
                formatter={(value, name) => [`${String(value)}${unit ?? ""}`, String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((item) => (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.name}
                  stroke={item.color}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
            采样点还不够（每小时一个，攒两个以上才能画线）
          </p>
        )}
      </div>
    </div>
  );
}
