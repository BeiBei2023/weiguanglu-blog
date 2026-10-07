"use client";

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { CountUp } from "@/components/w/metric-number";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  Bot,
  Download,
  Globe2,
  ListFilter,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { VisitorMap } from "@/components/views/visitor-map";
import {
  clearViewLogsAction,
  saveViewsSettingsAction,
  updateGeoipAction,
  type ViewsActionResult,
} from "@/app/w/views/actions";
import type { Bucket, PostStat, ViewEntryView, ViewQuery, ViewsSnapshot } from "@/lib/views-stats";
import { formatBytes, formatClock, formatAgo } from "@/lib/format";

const TREND_CONFIG: ChartConfig = {
  pv: { label: "浏览量", color: "var(--primary)" },
  uv: { label: "独立访客", color: "#7ea2c8" },
};

const RANGE_LABELS: { value: ViewQuery["range"]; label: string }[] = [
  { value: "1d", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "all", label: "全部" },
];

type Tab = "overview" | "top" | "feed" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "总览" },
  { id: "top", label: "热门榜" },
  { id: "feed", label: "访客流水" },
  { id: "settings", label: "设置" },
];

// ── 基础设施 ────────────────────────────────────────────────────────

function emptySubscribe(): () => void {
  return () => {};
}

/** 只在客户端为 true（避免水合不一致） */
function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  // 只在标签页可见时更新「现在」，后台标签页不白刷
  useVisibleInterval(() => setNow(Date.now()), intervalMs);
  return now;
}




function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

function csvCell(value: string): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 时间显示：客户端渲染相对时间，服务端渲染绝对时间 */
function TimeText({ iso }: { iso: string }) {
  const isClient = useIsClient();
  const now = useNow(15000);
  if (!isClient) return <span className="tabular-nums">{formatClock(iso)}</span>;
  return (
    <span className="tabular-nums" title={formatClock(iso)}>
      {formatAgo(iso, now)}
    </span>
  );
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

function BucketList({ title, buckets, total }: { title: string; buckets: Bucket[]; total: number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {buckets.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground/70">暂无数据</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {buckets.slice(0, 6).map((item) => (
            <li key={item.name}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.count} · {formatPercent(total ? item.count / total : 0)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${total ? Math.max(3, (item.count / total) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MarkBadges({ entry }: { entry: ViewEntryView }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {entry.self ? (
        <Badge variant="outline" className="gap-1 text-[10px]">
          <UserRound className="size-3" />
          自己
        </Badge>
      ) : null}
      {entry.bot ? (
        <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <Bot className="size-3" />
          机器人
        </Badge>
      ) : null}
      {!entry.self && !entry.bot ? (
        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
          访客
        </Badge>
      ) : null}
    </span>
  );
}

// ── 面板 ────────────────────────────────────────────────────────────

export function ViewsPanel({ initial }: { initial: ViewsSnapshot }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [snap, setSnap] = useState<ViewsSnapshot>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const { confirm, confirmDialog } = useConfirm();

  // 流水页签状态
  const [range, setRange] = useState<ViewQuery["range"]>("7d");
  const [slug, setSlug] = useState("__all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [showBots, setShowBots] = useState(false);
  const [feed, setFeed] = useState<ViewEntryView[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedLoading, setFeedLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [topQuery, setTopQuery] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const [saveState, setSaveState] = useState<ViewsActionResult | null>(null);
  const [savePending, setSavePending] = useState(false);

  const mask = snap.settings.maskIp;

  const slugOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const post of snap.top) map.set(post.slug, post.title);
    for (const entry of feed) if (!map.has(entry.slug)) map.set(entry.slug, entry.title);
    return [...map.entries()];
  }, [snap.top, feed]);

  const topRows = useMemo(() => {
    const key = topQuery.trim().toLowerCase();
    if (!key) return snap.top;
    return snap.top.filter(
      (post) => post.title.toLowerCase().includes(key) || post.slug.toLowerCase().includes(key),
    );
  }, [snap.top, topQuery]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/w/views/snapshot?days=30", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as ViewsSnapshot;
      setSnap(next);
      setEpoch((value) => value + 1);
    } catch {
      toast.error("刷新失败，请稍后再试");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const onSaveSettings = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setSavePending(true);
      const result = await saveViewsSettingsAction(null, formData);
      setSavePending(false);
      setSaveState(result);
      if (result.ok) {
        toast.success(result.notice ?? "已保存");
        await refresh();
      }
    },
    [refresh],
  );

  const loadFeed = useCallback(
    async (
      offset: number,
      replace: boolean,
      override?: { range?: ViewQuery["range"]; slug?: string; q?: string; bots?: boolean },
    ) => {
      const useRange = override?.range ?? range;
      const useSlug = override?.slug ?? slug;
      const useQ = override?.q ?? q;
      const useBots = override?.bots ?? showBots;
      setFeedLoading(true);
      try {
        const params = new URLSearchParams({
          range: useRange,
          limit: "100",
          offset: String(offset),
        });
        if (useSlug !== "__all") params.set("slug", useSlug);
        if (useQ) params.set("q", useQ);
        if (useBots) params.set("bots", "1");
        const res = await fetch(`/api/w/views/logs?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { total: number; entries: ViewEntryView[] };
        setFeedTotal(data.total);
        setFeed((prev) => (replace ? data.entries : [...prev, ...data.entries]));
      } catch {
        toast.error("读取流水失败");
      } finally {
        setFeedLoading(false);
      }
    },
    [range, slug, q, showBots],
  );

  const openFeed = useCallback(
    (nextSlug?: string) => {
      setTab("feed");
      void loadFeed(0, true, nextSlug ? { slug: nextSlug } : undefined);
    },
    [loadFeed],
  );

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ range, limit: "2000", offset: "0" });
      if (slug !== "__all") params.set("slug", slug);
      if (q) params.set("q", q);
      if (showBots) params.set("bots", "1");
      const res = await fetch(`/api/w/views/logs?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: ViewEntryView[] };
      const header = [
        "时间",
        "文章",
        "链接",
        "IP",
        "地区",
        "设备",
        "操作系统",
        "浏览器",
        "来源",
        "是否机器人",
        "是否自己",
      ];
      const lines = [
        header.join(","),
        ...data.entries.map((entry) =>
          [
            entry.t,
            entry.title,
            `/posts/${entry.slug}`,
            mask ? entry.ipMasked : entry.ip,
            entry.geo,
            entry.uaInfo.device,
            entry.uaInfo.os,
            entry.uaInfo.browser,
            entry.ref || "直接访问",
            entry.bot ? "是" : "",
            entry.self ? "是" : "",
          ]
            .map(csvCell)
            .join(","),
        ),
      ];
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadText(`阅读流水-${stamp}.csv`, `\uFEFF${lines.join("\r\n")}`, "text/csv;charset=utf-8");
      toast.success(`已导出 ${data.entries.length} 条流水`);
    } catch {
      toast.error("导出失败");
    } finally {
      setExporting(false);
    }
  }, [range, slug, q, showBots, mask]);

  const onClearLogs = useCallback(async () => {
    const ok = await confirm({
      title: "清空访客流水？",
      description:
        "所有单次访问记录（时间、来源、设备、IP）都会被删除，文章的阅读量总数不受影响。此操作不可撤销。",
      confirmLabel: "清空流水",
    });
    if (!ok) return;
    setClearBusy(true);
    const result = await clearViewLogsAction();
    setClearBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "清空失败");
      return;
    }
    toast.success(result.notice ?? "已清空");
    setFeed([]);
    setFeedTotal(0);
    await refresh();
  }, [confirm, refresh]);

  const onUpdateGeoip = useCallback(async () => {
    setGeoBusy(true);
    const result = await updateGeoipAction();
    setGeoBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "更新失败");
      return;
    }
    toast.success(result.notice ?? "已更新");
    await refresh();
  }, [refresh]);

  const feedReal = snap.totals.week;

  return (
    <>
      <nav className="glass sticky-bar sticky top-20 z-30 flex flex-wrap items-center gap-1 rounded-2xl p-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => (item.id === "feed" ? openFeed() : setTab(item.id))}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm transition",
              tab === item.id
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-1">
          {snap.geoip.ready ? (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <MapPin className="size-3.5 text-primary" />
              地区库已就绪
            </span>
          ) : (
            <span className="hidden items-center gap-1 text-xs text-amber-600 sm:flex dark:text-amber-400">
              <MapPin className="size-3.5" />
              未装地区库
            </span>
          )}
          <span className="hidden text-xs text-muted-foreground md:inline">
            流水 {snap.file.count} 条 · {formatBytes(snap.file.bytes)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground"
            onClick={() => void refresh()}
            title="刷新"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </nav>

      {!snap.geoip.ready ? (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <MapPin className="size-4 text-amber-600 dark:text-amber-400" />
          <span>
            还没装 IP 地区库，访客归属地显示不出来。到「设置」页签点一次「更新地区库」即可（约 60 MB，只需一次）。
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setTab("settings")}
          >
            去设置
          </Button>
        </div>
      ) : null}

      {tab === "overview" ? (
        <>
          {/* 读数带：一眼看清今天有没有人来看（与状态 / 体检页同一语言） */}
          <div className="glass overflow-hidden rounded-2xl">
            <div className="w-band wgl-cells">
              <div className="w-band-cell">
                <span className="band-label">今日浏览</span>
                <span className="band-value">
                  <CountUp text={String(snap.totals.today.pv)} />
                </span>
                <span className="band-hint">独立访客 {snap.totals.today.uv}</span>
              </div>
              <div className="w-band-cell">
                <span className="band-label">近 7 天</span>
                <span className="band-value">
                  <CountUp text={String(feedReal.pv)} />
                </span>
                <span className="band-hint">独立访客 {feedReal.uv}</span>
              </div>
              <div className="w-band-cell">
                <span className="band-label">累计阅读</span>
                <span className="band-value">
                  <CountUp text={String(snap.totals.allTime)} />
                </span>
                <span className="band-hint">近 30 天 {snap.totals.month.pv}</span>
              </div>
              <div className="w-band-cell">
                <span className="band-label">流水记录</span>
                <span className="band-value">
                  <CountUp text={String(snap.file.count)} />
                </span>
                <span className="band-hint">
                  {formatBytes(snap.file.bytes)} · 机器人 {formatPercent(snap.bots.ratio)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            icon={TrendingUp}
            title="最近 30 天趋势"
            hint="只统计真实访客（不含你自己与机器人）"
          >
            <ChartContainer config={TREND_CONFIG} className="h-[260px] w-full lg:h-[420px]">
              <AreaChart data={snap.series} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={20}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="pv"
                  stroke="var(--color-pv)"
                  fill="var(--color-pv)"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="uv"
                  stroke="var(--color-uv)"
                  fill="var(--color-uv)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </SectionCard>

          <SectionCard
            icon={MapPin}
            title="访客地图"
            hint="城市打点 + 省份/国家着色；鼠标停留看该地点的访客概览（可滚轮缩放、拖动）"
          >
            <VisitorMap data={snap.map} />
          </SectionCard>
          </div>

          <SectionCard
            icon={Globe2}
            title="访客构成"
            hint={`真实访客样本：${snap.series.reduce((sum, day) => sum + day.pv, 0)} 次浏览`}
          >
            <div className="grid grid-cols-2 gap-5 wgl-cells lg:grid-cols-5 lg:gap-0 lg:divide-x lg:divide-border/60">
              <div className="lg:px-5 lg:first:pl-0">
                <BucketList
                  title="浏览器"
                  buckets={snap.breakdown.browser}
                  total={snap.breakdown.browser.reduce((sum, item) => sum + item.count, 0)}
                />
              </div>
              <div className="lg:px-5 lg:first:pl-0">
                <BucketList
                  title="操作系统"
                  buckets={snap.breakdown.os}
                  total={snap.breakdown.os.reduce((sum, item) => sum + item.count, 0)}
                />
              </div>
              <div className="lg:px-5 lg:first:pl-0">
                <BucketList
                  title="设备"
                  buckets={snap.breakdown.device}
                  total={snap.breakdown.device.reduce((sum, item) => sum + item.count, 0)}
                />
              </div>
              <div className="lg:px-5 lg:first:pl-0">
                <BucketList
                  title="来源"
                  buckets={snap.breakdown.ref}
                  total={snap.breakdown.ref.reduce((sum, item) => sum + item.count, 0)}
                />
              </div>
              <div className="lg:px-5 lg:first:pl-0">
                <BucketList
                  title="地区"
                  buckets={snap.breakdown.geo}
                  total={snap.breakdown.geo.reduce((sum, item) => sum + item.count, 0)}
                />
              </div>
            </div>
          </SectionCard>

        </>
      ) : null}

      {tab === "top" ? (
        <SectionCard
          icon={BarChart3}
          title="热门榜"
          hint="按今日 → 近 7 天 → 累计阅读排序；点一行看它的访客明细"
          action={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={topQuery}
                onChange={(event) => setTopQuery(event.target.value)}
                placeholder="搜索标题"
                className="h-8 w-40 pl-7 text-xs"
              />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文章</TableHead>
                  <TableHead className="text-right">今日</TableHead>
                  <TableHead className="text-right">近 7 天</TableHead>
                  <TableHead className="text-right">独立访客</TableHead>
                  <TableHead className="text-right">累计阅读</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      还没有阅读数据
                    </TableCell>
                  </TableRow>
                ) : (
                  topRows.map((post) => (
                    <TopRow
                      key={post.slug}
                      post={post}
                      onPick={(value) => {
                        setSlug(value);
                        openFeed(value);
                      }}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      {tab === "feed" ? (
        <SectionCard
          icon={ListFilter}
          title="访客流水"
          hint="按时间倒序；「访客」= 真实读者，机器人与你自己单独标记"
          action={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onExport()}
                disabled={exporting}
              >
                <Download className={cn("size-3.5", exporting && "animate-pulse")} />
                导出 CSV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-8 p-0 text-muted-foreground"
                onClick={() => void loadFeed(0, true)}
                disabled={feedLoading}
                title="刷新"
              >
                <RefreshCw className={cn("size-3.5", feedLoading && "animate-spin")} />
              </Button>
            </>
          }
        >
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">时间范围</Label>
              <Select
                value={range}
                onValueChange={(value) => {
                  const next = value as ViewQuery["range"];
                  setRange(next);
                  void loadFeed(0, true, { range: next });
                }}
              >
                <SelectTrigger className="mt-1 h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_LABELS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">文章</Label>
              <Select
                value={slug}
                onValueChange={(value) => {
                  setSlug(value);
                  void loadFeed(0, true, { slug: value });
                }}
              >
                <SelectTrigger className="mt-1 h-8 w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">全部文章</SelectItem>
                  {slugOptions.map(([value, title]) => (
                    <SelectItem key={value} value={value}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">关键字</Label>
              <div className="mt-1 flex items-center gap-1">
                <Input
                  value={qInput}
                  onChange={(event) => setQInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const next = qInput.trim();
                      setQ(next);
                      void loadFeed(0, true, { q: next });
                    }
                  }}
                  placeholder="IP / 来源 / 设备"
                  className="h-8 w-[160px] text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = qInput.trim();
                    setQ(next);
                    void loadFeed(0, true, { q: next });
                  }}
                >
                  搜索
                </Button>
                {q ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setQInput("");
                      setQ("");
                      void loadFeed(0, true, { q: "" });
                    }}
                  >
                    清除
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch
                id="views-bots"
                checked={showBots}
                onCheckedChange={(value) => {
                  setShowBots(value);
                  void loadFeed(0, true, { bots: value });
                }}
              />
              <Label htmlFor="views-bots" className="text-xs text-muted-foreground">
                显示机器人
              </Label>
            </div>
            {slug !== "__all" ? (
              <Badge variant="outline" className="mb-1 gap-1 text-[10px]">
                <ListFilter className="size-3" />
                已按文章筛选
                <button
                  type="button"
                  className="ml-1 underline"
                  onClick={() => {
                    setSlug("__all");
                    void loadFeed(0, true, { slug: "__all" });
                  }}
                >
                  取消
                </button>
              </Badge>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            共 {feedTotal} 条{feed.length < feedTotal ? `，已加载 ${feed.length} 条` : ""}
          </p>

          <ul className="mt-2 divide-y divide-border/60">
            {feed.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">
                {feedLoading ? "读取中…" : "这个范围内还没有访问记录"}
              </li>
            ) : (
              feed.map((entry, index) => (
                <li
                  key={`${entry.t}-${entry.ip}-${index}`}
                  className="group relative -mx-2 rounded-lg px-2 py-3 transition-colors hover:bg-accent/40"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-3.5 h-6 w-0.5 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <a
                      href={`/posts/${entry.slug}`}
                      className="min-w-0 flex-1 truncate text-[15px] font-medium transition-colors hover:text-primary"
                      title={entry.title}
                    >
                      {entry.title}
                    </a>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      <TimeText iso={entry.t} />
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                    <span className="font-mono">{mask ? entry.ipMasked : entry.ip}</span>
                    <span>{entry.geo || "—"}</span>
                    <span>
                      {entry.uaInfo.device} · {entry.uaInfo.browser}
                      <span className="opacity-70"> / {entry.uaInfo.os}</span>
                    </span>
                    <span className="max-w-[180px] truncate" title={entry.ref}>
                      {entry.ref || "直接访问"}
                    </span>
                    <span className="ml-auto shrink-0">
                      <MarkBadges entry={entry} />
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>

          {feed.length < feedTotal ? (
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadFeed(feed.length, false)}
                disabled={feedLoading}
              >
                {feedLoading ? "加载中…" : "加载更多"}
              </Button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {tab === "settings" ? (
        <>
          <SectionCard
            icon={Settings2}
            title="记录设置"
            hint="只影响以后的访问；改完立即生效"
          >
            <form onSubmit={onSaveSettings} className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="views-max" className="text-xs text-muted-foreground">
                    最多保留流水条数
                  </Label>
                  <Input
                    key={`max-${epoch}`}
                    id="views-max"
                    name="maxEntries"
                    type="number"
                    min={200}
                    max={50000}
                    step={100}
                    defaultValue={snap.settings.maxEntries}
                    className="mt-1 h-8 w-[140px] text-xs"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  当前 {snap.file.count} 条 · {formatBytes(snap.file.bytes)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 wgl-cells">
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-accent/40 p-3">
                  <span>
                    <span className="text-sm">IP 打码显示</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      界面显示为 1.2.3.x（磁盘里仍存完整 IP）
                    </span>
                  </span>
                  <Switch
                    key={`mask-${epoch}`}
                    name="maskIp"
                    defaultChecked={snap.settings.maskIp}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-accent/40 p-3">
                  <span>
                    <span className="text-sm">记录浏览器 / 系统</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      关闭后流水只记时间与文章
                    </span>
                  </span>
                  <Switch
                    key={`ua-${epoch}`}
                    name="recordUa"
                    defaultChecked={snap.settings.recordUa}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-accent/40 p-3">
                  <span>
                    <span className="text-sm">记录来源页面</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      从搜索引擎或别的站点点进来的来源域名
                    </span>
                  </span>
                  <Switch
                    key={`ref-${epoch}`}
                    name="recordRef"
                    defaultChecked={snap.settings.recordRef}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-accent/40 p-3">
                  <span>
                    <span className="text-sm">记录机器人</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      关闭后爬虫、命令行工具的访问不写流水
                    </span>
                  </span>
                  <Switch
                    key={`bots-${epoch}`}
                    name="recordBots"
                    defaultChecked={snap.settings.recordBots}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={savePending}>
                  {savePending ? "保存中…" : "保存设置"}
                </Button>
                {saveState?.error ? (
                  <span className="text-xs text-destructive">{saveState.error}</span>
                ) : null}
                {saveState?.notice ? (
                  <span className="text-xs text-muted-foreground">{saveState.notice}</span>
                ) : null}
              </div>
            </form>
          </SectionCard>

          <SectionCard
            icon={MapPin}
            title="IP 地区库"
            hint="离线解析访客大概归属地（国家 / 省 / 城市），不上传任何数据"
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onUpdateGeoip()}
                disabled={geoBusy}
              >
                <RefreshCw className={cn("size-3.5", geoBusy && "animate-spin")} />
                {snap.geoip.ready ? "更新地区库" : "下载地区库"}
              </Button>
            }
          >
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                状态：
                {snap.geoip.ready ? (
                  <span className="text-emerald-600 dark:text-emerald-400">已就绪</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">未安装</span>
                )}
                {snap.geoip.file ? ` · ${snap.geoip.file}` : ""}
                {snap.geoip.bytes ? ` · ${formatBytes(snap.geoip.bytes)}` : ""}
              </p>
              {snap.geoip.updatedAt ? <p>更新于 {formatClock(snap.geoip.updatedAt)}</p> : null}
              <p>文件位置：{snap.geoip.dir}</p>
              {snap.geoip.error ? <p className="text-destructive">{snap.geoip.error}</p> : null}
              <p>
                说明：地区是“IP 的注册地/出口地”，不一定是访客本人所在地；内网访问显示为「内网」。
              </p>
            </div>
          </SectionCard>

          <SectionCard icon={Trash2} title="数据清理" hint="阅读量累计数字（views.json）不会被这里影响">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onClearLogs()}
                disabled={clearBusy}
              >
                {clearBusy ? "清空中…" : "清空访客流水"}
              </Button>
              <p className="text-xs text-muted-foreground">
                当前 {snap.file.count} 条
                {snap.file.firstAt ? ` · 最早 ${formatClock(snap.file.firstAt)}` : ""}
                {snap.file.lastAt ? ` · 最近 ${formatClock(snap.file.lastAt)}` : ""}
              </p>
            </div>
          </SectionCard>
        </>
      ) : null}

      {confirmDialog}
    </>
  );
}

function TopRow({
  post,
  onPick,
}: {
  post: PostStat;
  onPick: (slug: string) => void;
}) {
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => {
        onPick(post.slug);
      }}
    >
      <TableCell className="max-w-[380px]">
        <span className="block truncate text-sm" title={post.title}>
          {post.title}
        </span>
        <span className="text-xs text-muted-foreground">/posts/{post.slug}</span>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {post.today > 0 ? post.today : <span className="text-muted-foreground">0</span>}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {post.week > 0 ? post.week : <span className="text-muted-foreground">0</span>}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {post.uv > 0 ? post.uv : <span className="text-muted-foreground">0</span>}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">{post.views}</TableCell>
    </TableRow>
  );
}
