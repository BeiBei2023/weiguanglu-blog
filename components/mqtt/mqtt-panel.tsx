"use client";

import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Copy,
  Cpu,
  FileDown,
  Globe,
  KeyRound,
  Plus,
  Power,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Unplug,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  clearCommandsAction,
  clearDenialsAction,
  clearHistoryAction,
  clearRecentAction,
  clearRetainedAction,
  createAccountAction,
  deleteAccountAction,
  disconnectAllAction,
  disconnectClientAction,
  pushOtaAction,
  resetPasswordAction,
  saveSettingsAction,
  updateAccountAction,
  type MqttActionResult,
} from "@/app/w/mqtt/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { buildConnectDoc, connectDocFilename } from "@/lib/mqtt/connect-doc";
import { cn } from "cn";
import { formatClock, formatAgo } from "@/lib/format";

export interface MqttAccountView {
  id: string;
  username: string;
  prefix: string;
  note: string;
  otaProject: string;
  allowAnyTopic: boolean;
  enabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  published: number;
}
export interface MqttClientView {
  id: string;
  username: string;
  ip: string;
  connectedAt: string;
  subscriptions: string[];
  published: number;
  lastPingAt: string | null;
}
export interface MqttRetainedView {
  topic: string;
  payload: string;
  qos: number;
  at: string;
}
export interface MqttMessageView {
  at: string;
  topic: string;
  qos: number;
  retain: boolean;
  payload: string;
  clientId: string;
  fromSite?: boolean;
}
export interface MqttDeviceView {
  username: string;
  prefix: string;
  otaProject: string;
  online: boolean;
  status: string | null;
  statusAt: string | null;
  lastAt: string | null;
  metrics: string[];
  published: number;
  runtime: {
    id: string;
    ip: string;
    connectedAt: string;
    subscriptions: string[];
    lastPingAt: string | null;
    published: number;
  } | null;
}
export interface MqttCommandView {
  id: string;
  at: string;
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
  device: string;
  auto: boolean;
  ackedAt: string | null;
  ackPayload: string | null;
}
export interface MqttDenialView {
  at: string;
  kind: "auth" | "publish" | "subscribe";
  username: string;
  ip: string;
  topic?: string;
  reason: string;
}
export interface MqttHistoryTopicView {
  topic: string;
  count: number;
  last: { t: number; v: number };
  field: string | null;
}
export interface MqttStatusView {
  listening: boolean;
  error: string | null;
  enabled: boolean;
  port: number;
  wsEnabled: boolean;
  wsListening: boolean;
  wsPort: number;
  wsError: string | null;
  /** 公网可直接连的 wss 地址（null = 只在内网用） */
  publicWsUrl: string | null;
  /** WebSocket 路径（内网 ws:// 与公网 wss 共用） */
  wsPath: string;
  startedAt: string | null;
  addresses: string[];
  online: number;
  totalMessages: number;
  retained: number;
  denied: number;
}
export interface MqttSnapshot {
  status: MqttStatusView;
  clients: MqttClientView[];
  devices: MqttDeviceView[];
  retained: MqttRetainedView[];
  commands: MqttCommandView[];
  denials: MqttDenialView[];
  recent: MqttMessageView[];
  historyTopics: MqttHistoryTopicView[];
  /** topic → 最近若干个点（画设备卡迷你曲线用） */
  history: Record<string, { t: number; v: number }[]>;
  otaProjects: string[];
  accounts: MqttAccountView[];
  /** 非空 = data/mqtt.json 有问题（写入已被阻止），面板顶部显示红色提示条 */
  configWarning: string;
}

const emptySubscribe = () => () => {};

/**
 * 服务端渲染时返回 false、水合后返回 true。
 * 时间/相对时间在服务端（容器 TZ）与浏览器（本地 TZ）格式化结果可能不同，
 * 直接渲染会导致 hydration 不一致（React #418），所以统一在水合后再显示。
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/** 客户端时钟：每 tick 更新一次（用于计算持续时长，避免渲染期调用 Date.now） */
function useNow(intervalMs = 2000): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      const timer = setInterval(onStoreChange, intervalMs);
      return () => clearInterval(timer);
    },
    () => Date.now(),
    () => 0,
  );
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分`;
  return `${seconds} 秒`;
}



async function copy(text: string, label = "已复制") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("复制失败，请手动选择");
  }
}

const MQTT_TABS = [
  { id: "overview", label: "总览", icon: Cpu },
  { id: "devices", label: "设备", icon: KeyRound },
  { id: "data", label: "数据", icon: TrendingUp },
  { id: "settings", label: "设置", icon: Power },
] as const;
type MqttTabId = (typeof MQTT_TABS)[number]["id"];

/** MQTT 页面吸顶导航：左侧页签，右侧运行状态与刷新 */
function MqttNav({
  tab,
  onTabChange,
  status,
  onRefresh,
  refreshing,
}: {
  tab: MqttTabId;
  onTabChange: (next: MqttTabId) => void;
  status: MqttStatusView;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <nav className="glass sticky-bar sticky top-20 z-30 flex flex-wrap items-center gap-1 rounded-2xl p-1.5">
      {MQTT_TABS.map((item) => {
        const active = tab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
            status.listening
              ? "border-emerald-500/40 text-emerald-500"
              : "border-border text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 rounded-full", status.listening ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {status.listening ? `运行中 · 端口 ${status.port}` : "已停用"}
        </span>
        {status.wsEnabled ? (
          <span
            title={status.wsError ?? (status.wsListening ? "MQTT over WebSocket 已监听，可走 wss://域名 连" : "WebSocket 未监听")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
              status.wsListening ? "border-border text-muted-foreground" : "border-amber-500/40 text-amber-500",
            )}
          >
            <span className={cn("size-1.5 rounded-full", status.wsListening ? "bg-emerald-500/70" : "bg-amber-500")} />
            WS {status.wsPort}
          </span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onRefresh} title="刷新数据" className="size-8 p-0 text-muted-foreground">
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>
    </nav>
  );
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  children,
  action,
}: {
  icon: typeof Radio;
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-sm font-semibold">{title}</h2>
          </div>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TimeText({ iso, relative = true }: { iso: string | null; relative?: boolean }) {
  const isClient = useIsClient();
  if (!isClient || !iso) return <span className="text-muted-foreground">—</span>;
  return <>{relative ? formatAgo(iso) : formatClock(iso)}</>;
}

function Copyable({ value, label }: { value: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void copy(value, `已复制 ${value}`)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-mono text-xs transition-colors hover:border-primary/60 hover:text-primary"
    >
      <Copy className="size-3" />
      {label ?? value}
    </button>
  );
}

/** 把 wss://host/mqtt-ws 这类 WebSocket 地址换算成站点地址（wss→https、ws→http）；拿不到时返回 null */
function siteUrlFromWs(publicWsUrl: string | null): string | null {
  if (!publicWsUrl) return null;
  try {
    const url = new URL(publicWsUrl);
    const scheme = url.protocol === "wss:" ? "https:" : "http:";
    return `${scheme}//${url.host}`;
  } catch {
    return null;
  }
}

/** 组装并下载「设备连接说明」Markdown（说明内容见 lib/mqtt/connect-doc.ts） */
function downloadConnectDoc(
  status: MqttStatusView,
  account: Pick<
    MqttAccountView,
    "username" | "prefix" | "note" | "otaProject" | "allowAnyTopic" | "enabled"
  >,
  options?: { password?: string; issue?: "created" | "reset" | "later" },
): void {
  const tcpAddress = status.addresses[0] ?? `localhost:${status.port}`;
  const doc = buildConnectDoc({
    username: account.username,
    password: options?.password,
    prefix: account.prefix || `wgl/${account.username}/`,
    note: account.note,
    otaProject: account.otaProject,
    allowAnyTopic: account.allowAnyTopic,
    enabled: account.enabled,
    siteUrl: siteUrlFromWs(status.publicWsUrl) ?? window.location.origin,
    publicWsUrl: status.publicWsUrl,
    tcpAddress,
    wsPort: status.wsPort,
    wsPath: status.wsPath || "/mqtt-ws",
    issue: options?.issue ?? "later",
  });
  const url = URL.createObjectURL(new Blob([doc], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = connectDocFilename(account.username);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast.success("连接说明已下载（Markdown，可用记事本/VS Code 打开）");
}

/** 一次性密码展示（创建 / 重置后只显示一次）+ 直接下载连接说明 */
function OneTimePassword({
  account,
  status,
  password,
  issue,
}: {
  account: Pick<
    MqttAccountView,
    "username" | "prefix" | "note" | "otaProject" | "allowAnyTopic" | "enabled"
  >;
  status: MqttStatusView;
  password: string;
  issue: "created" | "reset";
}) {
  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
      <p className="text-xs text-muted-foreground">
        账号 <span className="font-mono text-foreground">{account.username}</span> 的一次性密码（
        <strong className="text-foreground">只显示这一次</strong>，请立刻保存）：
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-background/60 px-3 py-1.5 font-mono text-base tracking-wider">
          {password}
        </code>
        <Button size="sm" variant="outline" onClick={() => void copy(password, "密码已复制")}>
          <Copy className="size-3.5" />
          复制密码
        </Button>
        <Button
          size="sm"
          onClick={() => downloadConnectDoc(status, account, { password, issue })}
        >
          <FileDown className="size-3.5" />
          下载连接说明
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        说明文档含：账号与密码、公网 wss / 内网 TCP 连接参数、MQTTX 字段表、主题与遗嘱约定、ESP-IDF /
        Python / mqtt.js 示例代码（密码已直接写进去）、命令回执与 OTA、排查表。
      </p>
    </div>
  );
}

/** 账号行：随时下载该账号的连接说明（不含密码；密码只在创建/重置时能拿到） */
function ConnectDocButton({
  account,
  status,
}: {
  account: MqttAccountView;
  status: MqttStatusView;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      title="下载连接说明"
      aria-label={`下载连接说明 ${account.username}`}
      onClick={() => downloadConnectDoc(status, account, { issue: "later" })}
    >
      <FileDown className="size-3.5" />
    </Button>
  );
}

export function MqttPanel({ initial }: { initial: MqttSnapshot }) {
  const [snap, setSnap] = useState<MqttSnapshot>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState("");
  const [recentFilter, setRecentFilter] = useState("");
  const [tab, setTab] = useState<MqttTabId>("overview");

  // 连上了但对不上任何账号（账号被删/改名后设备仍连着）
  const orphanClients = snap.clients.filter(
    (client) => !snap.accounts.some((account) => account.username === client.username),
  );
﻿
  const [msgKind, setMsgKind] = useState<"all" | "cmd" | "msg">("all");

  // 命令 + 设备上报 合并成一条时间线（站点发出的消息已在命令里，避免重复）
  const mergedMessages = useMemo(() => {
    const items: Array<
      | { kind: "cmd"; at: string; cmd: MqttCommandView }
      | { kind: "msg"; at: string; msg: MqttMessageView }
    > = [];
    for (const cmd of snap.commands) items.push({ kind: "cmd", at: cmd.at, cmd });
    for (const msg of snap.recent) {
      if (msg.fromSite) continue;
      items.push({ kind: "msg", at: msg.at, msg });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
  }, [snap.commands, snap.recent]);

  const visibleMessages = mergedMessages.filter((item) => {
    if (msgKind === "cmd" && item.kind !== "cmd") return false;
    if (msgKind === "msg" && item.kind !== "msg") return false;
    const q = recentFilter.trim().toLowerCase();
    if (!q) return true;
    if (item.kind === "cmd") {
      return (
        item.cmd.topic.toLowerCase().includes(q) ||
        item.cmd.payload.toLowerCase().includes(q) ||
        item.cmd.device.toLowerCase().includes(q)
      );
    }
    return (
      item.msg.topic.toLowerCase().includes(q) ||
      item.msg.payload.toLowerCase().includes(q) ||
      item.msg.clientId.toLowerCase().includes(q)
    );
  });

  const refresh = useMemo(
    () => async () => {
      try {
        const res = await fetch("/api/w/mqtt/snapshot", { cache: "no-store" });
        if (res.ok) setSnap((await res.json()) as MqttSnapshot);
      } catch {
        // 忽略瞬时失败
      }
    },
    [],
  );

  // 只在标签页可见时轮询（2s 一次，后台常驻没必要）；切回来立刻刷一次
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 2000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const { status } = snap;
  const onlineUsers = new Set(snap.clients.map((client) => client.username));
  // MQTTX 等客户端要填的参数：公网 wss 优先，否则回落到内网 ws
  const mqttx = (() => {
    if (status.publicWsUrl) {
      try {
        const url = new URL(status.publicWsUrl);
        return { host: url.hostname, port: url.port || "443", path: url.pathname };
      } catch {
        // 落到下面
      }
    }
    const first = status.addresses[0] ?? "localhost";
    const [host, port] = first.split(":");
    return { host: host ?? "localhost", port: port ?? String(status.wsPort), path: "/mqtt-ws" };
  })();

  return (
    <div className="space-y-4">
      <MqttNav
        tab={tab}
        onTabChange={setTab}
        status={status}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await refresh();
          setRefreshing(false);
        }}
      />
      {snap.configWarning ? (
        <div className="glass flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-xs">
          <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
          <span className="font-medium text-destructive">配置文件有问题，写入已被阻止（防覆盖）</span>
          <span className="text-muted-foreground">{snap.configWarning}</span>
          <span className="text-muted-foreground">· 请检查服务器上的 data/mqtt.json</span>
        </div>
      ) : null}
      {tab === "overview" ? (
      <div className="space-y-4">
      {/* 状态：Hero + 指标 */}
      <section className="glass relative overflow-hidden rounded-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 130% at 0% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 60%)",
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2.5">
                {status.listening ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
                ) : null}
                <span
                  className={cn(
                    "relative inline-flex size-2.5 rounded-full",
                    status.listening ? "bg-emerald-500" : "bg-muted-foreground/50",
                  )}
                />
              </span>
              <h2 className="font-heading text-lg font-semibold">
                {status.listening ? "运行中" : status.enabled ? "未启动" : "已停用"}
              </h2>
              {status.error ? (
                <span className="truncate text-xs text-destructive" title={status.error}>
                  {status.error}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">mqtt://{status.addresses[0] ?? `localhost:${status.port}`}</span>
              <button
                type="button"
                onClick={() =>
                  void copy(`mqtt://${status.addresses[0] ?? `localhost:${status.port}`}`, "地址已复制")
                }
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 transition-colors hover:border-primary/60 hover:text-primary"
              >
                <Copy className="size-3" />
                复制
              </button>
              <span className="ml-1">MQTT 3.1.1 · 端口 {status.port}</span>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-2 wgl-cells">
            <BandCell icon={Users} label="在线设备" value={String(status.online)} hint={`账号 ${snap.accounts.length}`} />
            <BandCell icon={Activity} label="累计消息" value={String(status.totalMessages)} hint={`retained ${status.retained}`} />
            <BandCell
              icon={Power}
              label="持续运行"
              value={<Uptime startedAt={status.startedAt} />}
              hint="容器重建会重启"
            />
          </div>
        </div>
      </section>

      {snap.denials.length > 0 ? (
        <details className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
            <ShieldAlert className="size-3.5 shrink-0 text-amber-500" />
            <span className="font-medium text-amber-600 dark:text-amber-500">
              有 {snap.denials.length} 条被拦截的请求
            </span>
            <span className="text-muted-foreground">（主题写错时看这里）</span>
          </summary>
          <ul className="mt-2.5 space-y-1">
            {snap.denials.map((denial, index) => (
              <li
                key={`${denial.at}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5"
              >
                <span className="font-mono text-muted-foreground">
                  <TimeText iso={denial.at} relative={false} />
                </span>
                <Badge variant="outline" className="text-[10px] text-amber-500">
                  {denial.kind === "auth" ? "认证失败" : denial.kind === "publish" ? "越权发布" : "越权订阅"}
                </Badge>
                <span className="font-mono">{denial.username || "(空)"}</span>
                {denial.topic ? <TopicLabel topic={denial.topic} className="text-xs" /> : null}
                <span className="text-muted-foreground">{denial.reason}</span>
                {denial.ip ? (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{denial.ip}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <form action={clearDenialsAction} className="mt-2.5">
            <Button type="submit" size="sm" variant="outline">
              清空记录
            </Button>
          </form>
        </details>
      ) : null}

      {/* 设备总览 */}
      <SectionCard
        icon={Cpu}
        title="设备总览"
        hint="账号 + 状态推导；在线设备显示 连接/心跳/订阅，可直接下发或断开"
        action={
          status.online > 0 ? (
            <form action={disconnectAllAction}>
              <Button type="submit" size="sm" variant="outline" title="断开全部在线设备">
                <Unplug className="size-3.5" />
                全部断开
              </Button>
            </form>
          ) : null
        }
      >
        {snap.devices.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="还没有设备"
            hint="先到下面「设备账号」建一个，把用户名密码写进设备固件即可连上来。"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 wgl-cells">
            {snap.devices.map((device) => (
              <DeviceCard key={device.username} device={device} history={snap.history} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* 连接参数（低频，折叠） */}
      <details className="glass rounded-2xl px-4 py-3 text-xs" open={false}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
          <Radio className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">连接参数 / MQTTX 字段</span>
          <span className="text-muted-foreground">公网 wss、遗嘱、主题约定（点开）</span>
        </summary>
        <div className="mt-3 space-y-3">
          {status.addresses.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-muted-foreground">内网其他地址</span>
              {status.addresses.slice(1).map((address) => (
                <Copyable key={address} value={`mqtt://${address}`} />
              ))}
            </div>
          ) : null}
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 wgl-cells">
            <p>
              协议版本：<span className="text-foreground">MQTT 3.1.1</span>（不要选 5.0）
            </p>
            <p>
              用户名/密码：<span className="text-foreground">见下方「设备账号」</span>
            </p>
            <p>
              建议客户端 ID：<span className="text-foreground">设备名 + 短随机</span>
            </p>
            <p>
              遗嘱（LWT）：<span className="font-mono text-foreground">wgl/&lt;设备&gt;/status</span> →{" "}
              <span className="font-mono">offline</span>
            </p>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">外网（wss）</span>
              {status.publicWsUrl ? (
                <>
                  <span className="ml-2 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-1.5">
                    <span className="font-mono text-sm">{status.publicWsUrl}</span>
                    <button
                      type="button"
                      onClick={() => void copy(status.publicWsUrl ?? "", "wss 地址已复制")}
                      className="text-muted-foreground transition-colors hover:text-primary"
                      title="复制 wss 地址"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </span>
                  {status.wsListening ? null : (
                    <span className="ml-2 text-amber-500">（WebSocket 未监听，去「设置」里开启）</span>
                  )}
                </>
              ) : (
                <span className="ml-2">
                  内部 <span className="font-mono text-foreground">ws://{status.addresses[0] ?? `localhost:${status.wsPort}`}</span>
                  {" "}（配置 SITE_URL 后这里会显示公网 wss 地址）
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            主题约定：
            <span className="font-mono text-foreground">wgl/&lt;设备&gt;/status</span>（retained 在线状态）、
            <span className="font-mono text-foreground"> /telemetry/&lt;名称&gt;</span>、
            <span className="font-mono text-foreground"> /event</span>、
            <span className="font-mono text-foreground"> /cmd</span>
          </p>
          <details className="rounded-2xl border border-border/70 bg-surface p-3 text-xs" open={false}>
            <summary className="cursor-pointer list-none font-medium text-foreground">
              MQTTX / 客户端连接参数（点开）
            </summary>
            <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 wgl-cells">
              {[
                ["协议（Host 前的下拉）", status.publicWsUrl ? "wss://" : "ws://"],
                ["Host", mqttx.host],
                ["Port", mqttx.port],
                ["Path", mqttx.path],
                ["MQTT 版本", "3.1.1（重要：不能选 5.0）"],
                ["SSL/TLS", status.publicWsUrl ? "开启 · CA signed server" : "关闭（内网 ws）"],
                ["用户名 / 密码", "见下方「设备账号」里创建的账号"],
                ["Keep Alive / Clean Session", "60 秒 / 开"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate font-mono text-foreground" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-muted-foreground">
              遗嘱（Will）：主题 <span className="font-mono text-foreground">wgl/&lt;设备&gt;/status</span> 、载荷{" "}
              <span className="font-mono text-foreground">offline</span>、QoS 1、Retain 开
            </p>
            <p className="mt-1 text-muted-foreground">
              主题只能在自己前缀下：订阅 <span className="font-mono text-foreground">wgl/&lt;设备&gt;/#</span>、遥测{" "}
              <span className="font-mono text-foreground">wgl/&lt;设备&gt;/telemetry/&lt;名称&gt;</span>（如{" "}
              <span className="font-mono text-foreground">{`{"v":25.6}`}</span>）、命令{" "}
              <span className="font-mono text-foreground">wgl/&lt;设备&gt;/cmd</span>
              ；测试账号可在「设备账号」里打开「允许任意主题」
            </p>
            <p className="mt-1 text-amber-600 dark:text-amber-500">
              连上后过一会儿掉线？看设备卡上的「心跳」：显示「无」说明客户端没按 Keep Alive 发
              PINGREQ（客户端填 60 秒、别设 0；电脑休眠/合盖会停心跳）。用公网 wss(443)
              最稳，内网 TCP 走隧道时空闲连接可能被中间设备掐掉。
            </p>
          </details>

        </div>
      </details>

      </div>
      ) : null}

      {tab === "devices" ? (
      <div className="space-y-4">
      {/* 设备账号 */}
      <SectionCard
        icon={KeyRound}
        title="设备账号"
        hint="一台设备一个账号；改动立即生效，无需重启 broker"
        action={
          <div className="flex items-center gap-2">
            {snap.accounts.length > 1 ? (
              <FilterInput
                id="filter-accounts"
                value={accountFilter}
                onChange={setAccountFilter}
                placeholder="筛账号 / 备注 / 前缀…"
              />
            ) : null}
            <NewAccountDialog
              status={snap.status}
              accounts={snap.accounts}
              otaProjects={snap.otaProjects}
            />
          </div>
        }
      >
        {snap.accounts.length === 0 ? (
          <EmptyState icon={KeyRound} title="还没有账号" hint="点右上角「新建账号」，给每台设备发一个。" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>主题前缀</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead className="w-20">状态</TableHead>
                  <TableHead className="w-24">最近在线</TableHead>
                  <TableHead className="w-20 text-right">已发布</TableHead>
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snap.accounts
                  .filter((account) => {
                    const q = accountFilter.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      account.username.toLowerCase().includes(q) ||
                      account.note.toLowerCase().includes(q) ||
                      account.prefix.toLowerCase().includes(q)
                    );
                  })
                  .map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono text-xs">
                      <span className="inline-flex items-center gap-2">
                        {account.username}
                        {onlineUsers.has(account.username) ? (
                          <span className="size-1.5 rounded-full bg-emerald-500" title="在线" />
                        ) : null}
                        {account.allowAnyTopic ? (
                          <Badge variant="outline" className="text-[10px] text-amber-500">
                            任意主题
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <TopicLabel topic={account.prefix.replace(/\/$/, "")} />
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                      {account.note || "—"}
                    </TableCell>
                    <TableCell>
                      {account.enabled ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          启用
                        </Badge>
                      ) : (
                        <Badge variant="outline">已停用</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <TimeText iso={account.lastSeenAt} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {account.published}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <EditAccountDialog account={account} otaProjects={snap.otaProjects} />
                        <ResetPasswordButton
                          id={account.id}
                          username={account.username}
                          status={snap.status}
                          accounts={snap.accounts}
                        />
                        <ConnectDocButton account={account} status={snap.status} />
                        <DeleteAccountButton id={account.id} username={account.username} />
                      </div>
                    </TableCell>
                  </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* 对不上账号的连接（少见：账号被删/改名但设备仍连着） */}
      {orphanClients.length > 0 ? (
        <div className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs">
          <p className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-500">
            <ShieldAlert className="size-3.5" />
            有 {orphanClients.length} 个连接对不上任何账号
          </p>
          <ul className="mt-1.5 space-y-1">
            {orphanClients.map((client) => (
              <li key={client.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{client.id}</span>
                <span className="font-mono text-muted-foreground">{client.username}</span>
                {client.lastPingAt ? (
                  <TimeText iso={client.lastPingAt} />
                ) : (
                  <span className="text-amber-500">无心跳</span>
                )}
                <form action={disconnectClientAction} className="ml-auto">
                  <input type="hidden" name="clientId" value={client.id} />
                  <Button type="submit" size="sm" variant="outline">
                    断开
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Retained（折叠） */}
      <details className="glass rounded-2xl px-4 py-3 text-xs" open={false}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
          <Activity className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">Retained 状态</span>
          <span className="text-muted-foreground">
            {snap.retained.length > 0 ? `${snap.retained.length} 条（重启后自动回放）` : "暂无"}
          </span>
        </summary>
        <div className="mt-3">
        {snap.retained.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            设备发一条 retain 消息（如 <span className="font-mono">wgl/&lt;设备&gt;/status</span>）后会保留在这里。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>主题</TableHead>
                  <TableHead>载荷</TableHead>
                  <TableHead className="w-32">时间</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {snap.retained.map((entry) => (
                  <TableRow key={entry.topic}>
                    <TableCell className="text-xs">
                      <TopicLabel topic={entry.topic} />
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                      {entry.payload}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <TimeText iso={entry.at} relative={false} />
                    </TableCell>
                    <TableCell>
                      <form action={clearRetainedAction}>
                        <input type="hidden" name="topic" value={entry.topic} />
                        <Button type="submit" size="sm" variant="outline">
                          清除
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </div>
      </details>

      </div>
      ) : null}

      {tab === "data" ? (
      <div className="space-y-4">
      {/* 数值历史（折叠） */}
      <details className="glass rounded-2xl px-4 py-3 text-xs" open={false}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
          <TrendingUp className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">数值历史</span>
          <span className="text-muted-foreground">
            {snap.historyTopics.length > 0
              ? `${snap.historyTopics.length} 个主题 · 每主题最近 240 点（点开看曲线）`
              : "暂无数据"}
          </span>
        </summary>
        <div className="mt-3">
          {snap.historyTopics.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有数值遥测。设备往 <span className="font-mono">wgl/&lt;设备&gt;/telemetry/&lt;名称&gt;</span>{" "}
              发数字（或带数字字段的 JSON）就会自动记录。
            </p>
          ) : (
            <>
              <HistorySection topics={snap.historyTopics} />
              <form action={clearHistoryAction} className="mt-3">
                <Button type="submit" size="sm" variant="outline">
                  清空历史
                </Button>
              </form>
            </>
          )}
        </div>
      </details>

﻿      {/* 消息记录：命令 + 设备上报 合并 */}
      <SectionCard
        icon={Send}
        title="消息记录"
        hint="命令与设备上报合并显示（每 2 秒刷新）；命令可看重发与回执"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={msgKind}
              onChange={(event) => setMsgKind(event.target.value as "all" | "cmd" | "msg")}
              className="h-8 rounded-lg border border-border bg-transparent px-2 text-xs"
              aria-label="筛选类型"
            >
              <option value="all">全部</option>
              <option value="cmd">命令</option>
              <option value="msg">设备上报</option>
            </select>
            {mergedMessages.length > 3 ? (
              <FilterInput
                id="filter-messages"
                value={recentFilter}
                onChange={setRecentFilter}
                placeholder="筛主题 / 载荷 / 设备…"
              />
            ) : null}
            {snap.recent.length > 0 ? (
              <form action={clearRecentAction}>
                <Button type="submit" size="sm" variant="outline" title="清空设备上报消息">
                  清空上报
                </Button>
              </form>
            ) : null}
            {snap.commands.length > 0 ? (
              <form action={clearCommandsAction}>
                <Button type="submit" size="sm" variant="outline" title="清空命令记录">
                  清空命令
                </Button>
              </form>
            ) : null}
          </div>
        }
      >
        {visibleMessages.length === 0 ? (
          <EmptyState icon={Send} title="还没有消息" hint="下发命令或设备上报后都会出现在这里。" />
        ) : (
          <ul className="wgl-scroll max-h-[520px] space-y-1 overflow-y-auto">
            {visibleMessages.map((item) =>
              item.kind === "cmd" ? (
                <li
                  key={`cmd-${item.cmd.id}`}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    <TimeText iso={item.cmd.at} relative={false} />
                  </span>
                  <Badge variant="outline" className="text-[10px] text-primary">
                    命令
                  </Badge>
                  {item.cmd.auto ? (
                    <Badge variant="outline" className="text-[10px]">
                      自动
                    </Badge>
                  ) : null}
                  <span className="font-mono text-[10px] text-muted-foreground">{item.cmd.device}</span>
                  <TopicLabel topic={item.cmd.topic} className="text-xs" />
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                    {item.cmd.payload}
                  </span>
                  {item.cmd.ackedAt ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
                      ✓ 已回执
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-500">
                      等待回执
                    </span>
                  )}
                  <CommandRowActions command={item.cmd} />
                </li>
              ) : (
                <li
                  key={`msg-${item.msg.at}-${item.msg.clientId}`}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border/50 px-3 py-1.5 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    <TimeText iso={item.msg.at} relative={false} />
                  </span>
                  <span className="shrink-0 text-tag" aria-hidden>
                    ↓
                  </span>
                  <TopicLabel topic={item.msg.topic} className="text-xs" />
                  <Badge variant="outline" className="text-[10px]">
                    QoS{item.msg.qos}
                  </Badge>
                  {item.msg.retain ? (
                    <Badge variant="outline" className="text-[10px] text-primary">
                      retain
                    </Badge>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                    {item.msg.payload}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{item.msg.clientId}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </SectionCard>

      </div>
      ) : null}

      {tab === "settings" ? (
      <div className="space-y-4">
      {/* 设置 */}
      <BrokerSettings status={status} />
      </div>
      ) : null}
    </div>
  );
}

/** 从 retained status 里抠出可读信息（JSON 就取常见字段，否则原样显示） */
function describeStatus(status: string | null): string {
  if (!status) return "（还没上报过状态）";
  try {
    const obj = JSON.parse(status) as Record<string, unknown>;
    if (obj && typeof obj === "object") {
      const parts: string[] = [];
      if (typeof obj.fw === "string") parts.push(`固件 ${obj.fw}`);
      if (typeof obj.ip === "string") parts.push(`IP ${obj.ip}`);
      if (typeof obj.rssi === "number") parts.push(`RSSI ${obj.rssi}`);
      if (typeof obj.uptime === "number") parts.push(`${Math.round(obj.uptime / 60)} 分钟`);
      if (parts.length) return parts.join(" · ");
    }
  } catch {
    // 非 JSON：原样
  }
  return status;
}

/** 表格筛选输入（设备账号 / 在线设备 / 最近消息共用样式） */
function FilterInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  id: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="h-8 w-40 pl-8 pr-7 text-xs sm:w-52"
      />
      {value ? (
        <button
          type="button"
          aria-label="清空筛选"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/** 持续运行时长（随 2 秒轮询自刷新） */
function Uptime({ startedAt }: { startedAt: string | null }) {
  const now = useNow(2000);
  const isClient = useIsClient();
  if (!isClient || !startedAt) return <span className="text-muted-foreground">—</span>;
  return <>{formatDuration(now - new Date(startedAt).getTime())}</>;
}

/** 命令记录行操作：重发（同主题/载荷/QoS/retain）与复制 */
function CommandRowActions({ command }: { command: MqttCommandView }) {
  const [pending, setPending] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        title="按原样重发这条命令"
        className="size-7 p-0 text-muted-foreground hover:text-primary"
        onClick={async () => {
          setPending(true);
          try {
            const res = await fetch("/api/w/mqtt/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: command.topic,
                payload: command.payload,
                qos: command.qos,
                retain: command.retain,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (res.ok) toast.success("已按原样重发");
            else toast.error(data.error ?? "重发失败");
          } catch {
            toast.error("网络错误");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? <RefreshCw className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        title="复制内容"
        className="size-7 p-0 text-muted-foreground hover:text-primary"
        onClick={() => void copy(command.payload, "内容已复制")}
      >
        <Copy className="size-3.5" />
      </Button>
    </span>
  );
}

/** Hero 里的小指标块 */
function BandCell({
  icon: Icon,
  label,
  value,
  hint,
  warn = false,
}: {
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className={cn("mt-0.5 font-heading text-xl font-bold tabular-nums", warn && "text-amber-500")}>
        {value}
      </p>
      <p className="truncate text-[11px] tabular-nums text-muted-foreground">{hint}</p>
    </div>
  );
}

/** 统一空状态 */
function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Users;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">{title}</p>
      {hint ? <p className="max-w-md text-xs text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}

/** 主题着色显示：根命名空间弱化、设备名用墨青、其余正常 */
function TopicLabel({ topic, className }: { topic: string; className?: string }) {
  const parts = topic.split("/");
  return (
    <span className={cn("font-mono", className)} title={topic}>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? <span className="text-muted-foreground/50">/</span> : null}
          <span className={cn(index === 0 && "text-muted-foreground/70", index === 1 && "text-tag")}>
            {part}
          </span>
        </span>
      ))}
    </span>
  );
}

/** 设备卡里的迷你曲线（无历史时不显示） */
function Sparkline({ points }: { points: { t: number; v: number }[] }) {
  const isClient = useIsClient();
  if (!isClient || points.length < 2) return null;
  const values = points.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (
    <div className="flex items-end gap-px" aria-hidden>
      {points.map((point, index) => (
        <span
          key={index}
          className="w-1 rounded-sm bg-primary/50"
          style={{ height: `${8 + ((point.v - min) / span) * 24}px` }}
        />
      ))}
    </div>
  );
}

function DeviceCard({
  device,
  history,
}: {
  device: MqttDeviceView;
  history: Record<string, { t: number; v: number }[]>;
}) {
  const primaryMetric = device.metrics[0];
  const points = primaryMetric ? (history[primaryMetric] ?? []) : [];
  const latest = points.at(-1);
  const initial = device.username.slice(0, 1).toUpperCase();

  return (
    <article className="glass-soft group relative flex flex-col rounded-2xl p-3.5 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-2xl font-heading text-sm font-bold",
            device.online ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground",
          )}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-1.5 shrink-0">
              {device.online ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  device.online ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
            </span>
            <p className="truncate font-mono text-sm">{device.username}</p>
            <Badge
              variant="outline"
              className={cn("ml-auto shrink-0 text-[10px]", device.online && "border-emerald-500/40 text-emerald-500")}
            >
              {device.online ? "在线" : "离线"}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={device.status ?? ""}>
            {describeStatus(device.status)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 text-[11px] text-muted-foreground">
          <p>
            最近上报 <TimeText iso={device.lastAt} />
          </p>
          <p className="mt-0.5 flex items-center gap-1.5">
            {device.otaProject ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary">
                <Upload className="size-2.5" />
                {device.otaProject}
              </span>
            ) : (
              <span className="text-muted-foreground/70">未绑定 OTA</span>
            )}
            {primaryMetric ? (
              <span className="truncate font-mono" title={primaryMetric}>
                {primaryMetric.split("/").slice(-1)[0]}
                {latest ? ` ${latest.v}` : ""}
              </span>
            ) : null}
          </p>
        </div>
        <Sparkline points={points} />
      </div>

      {device.runtime ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground wgl-cells">
          <p className="truncate">
            连接 <TimeText iso={device.runtime.connectedAt} />
          </p>
          <p className="truncate">
            心跳{" "}
            {device.runtime.lastPingAt ? (
              <TimeText iso={device.runtime.lastPingAt} />
            ) : (
              <span className="text-amber-500" title="还没收到过 PINGREQ">
                无
              </span>
            )}
          </p>
          <p className="truncate font-mono">{device.runtime.ip || "—"}</p>
          <p className="truncate">
            已发 <span className="font-mono">{device.runtime.published}</span>
          </p>
          <p className="col-span-2 truncate font-mono" title={device.runtime.subscriptions.join(" ")}>
            订阅{" "}
            {device.runtime.subscriptions.length ? (
              device.runtime.subscriptions.join(" ")
            ) : (
              <span className="text-muted-foreground/70">—</span>
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
        <PublishDialog
          defaultTopic={`${device.prefix}cmd`}
          triggerLabel="下发"
          triggerIcon={<Send className="size-3.5" />}
        />
        {device.otaProject ? (
          <form action={pushOtaAction}>
            <input type="hidden" name="username" value={device.username} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              title={`通知设备升级到「${device.otaProject}」最新固件`}
            >
              <Upload className="size-3.5" />
              推升级
            </Button>
          </form>
        ) : null}
        {device.runtime ? (
          <form action={disconnectClientAction}>
            <input type="hidden" name="clientId" value={device.runtime.id} />
            <Button type="submit" size="sm" variant="outline" title="断开该设备">
              <Unplug className="size-3.5" />
              断开
            </Button>
          </form>
        ) : null}
        <Copyable value={device.prefix} label="前缀" />
      </div>
    </article>
  );
}

/** 下发命令弹窗（可预填主题；fetch 发送，成功后自动关弹窗 + Toast） */
function PublishDialog({
  defaultTopic = "",
  presetTopic,
  triggerLabel = "下发消息",
  triggerIcon,
}: {
  defaultTopic?: string;
  presetTopic?: string;
  triggerLabel?: string;
  triggerIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState(presetTopic ?? defaultTopic);
  const [payload, setPayload] = useState('{"cmd":"reboot"}');
  const [qos, setQos] = useState("1");
  const [retain, setRetain] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/w/mqtt/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), payload, qos: Number(qos), retain }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "发送失败");
        return;
      }
      toast.success(`已发送到 ${topic.trim()}`);
      setOpen(false);
    } catch {
      setError("网络错误，发送失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      key={open ? "open" : "closed"}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTopic(presetTopic ?? defaultTopic);
          setPayload('{"cmd":"reboot"}');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerIcon}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>下发消息</DialogTitle>
          <DialogDescription>
            以站点身份发布（不经过设备 ACL）；设备需订阅该主题（一般是
            <span className="font-mono"> wgl/&lt;设备&gt;/cmd</span>）
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pub-topic">主题</Label>
            <Input
              id="pub-topic"
              name="topic"
              required
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="wgl/esp32-keting/cmd"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-payload">消息内容（建议 JSON）</Label>
            <Textarea
              id="pub-payload"
              name="payload"
              rows={3}
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pub-qos">QoS</Label>
              <Select value={qos} onValueChange={setQos} name="qos">
                <SelectTrigger id="pub-qos" className="w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0（最多一次）</SelectItem>
                  <SelectItem value="1">1（至少一次）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="pub-retain"
                name="retain"
                checked={retain}
                onCheckedChange={setRetain}
              />
              <Label htmlFor="pub-retain">retain（保留最后一条）</Label>
            </div>
            <Button type="submit" size="sm" disabled={pending} className="mb-0.5">
              {pending ? "发送中…" : "发送"}
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

const HISTORY_CONFIG: ChartConfig = { v: { label: "数值", color: "var(--primary)" } };

function HistorySection({ topics }: { topics: MqttHistoryTopicView[] }) {
  const [selected, setSelected] = useState(topics[0]?.topic ?? "");
  const active = topics.some((item) => item.topic === selected) ? selected : (topics[0]?.topic ?? "");
  const current = topics.find((item) => item.topic === active);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={active} onValueChange={setSelected}>
          <SelectTrigger className="w-full max-w-sm text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {topics.map((item) => (
              <SelectItem key={item.topic} value={item.topic} className="font-mono text-xs">
                {item.topic}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {current ? (
          <span className="text-xs text-muted-foreground">
            {current.count} 点 · 最新 <span className="font-mono text-foreground">{current.last.v}</span>
            {current.field ? <span className="ml-2 font-mono">（字段 {current.field}）</span> : null}
          </span>
        ) : null}
      </div>
      {active ? <HistoryChart key={active} topic={active} /> : null}
    </div>
  );
}

function HistoryChart({ topic }: { topic: string }) {
  const isClient = useIsClient();
  const [points, setPoints] = useState<{ t: number; v: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchPoints = async () => {
      try {
        const res = await fetch(`/api/w/mqtt/history?topic=${encodeURIComponent(topic)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { points?: { t: number; v: number }[] };
        if (alive && Array.isArray(data.points)) setPoints(data.points);
      } catch {
        // 忽略瞬时失败
      }
    };
    void fetchPoints();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchPoints();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchPoints();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [topic]);

  // 曲线只在浏览器端绘制（时间轴格式化依赖本地时区，服务端渲染会水合不一致）
  if (!isClient) return <div className="mt-3 h-[220px]" />;
  if (points.length === 0) {
    return <p className="mt-4 text-center text-xs text-muted-foreground">暂无数据点</p>;
  }

  const values = points.map((point) => point.v);
  const latest = values[values.length - 1];
  const stats: { label: string; value: number }[] = [
    { label: "最新", value: latest },
    { label: "最小", value: Math.min(...values) },
    { label: "最大", value: Math.max(...values) },
    { label: "平均", value: values.reduce((sum, value) => sum + value, 0) / values.length },
  ];

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 wgl-cells">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border/60 bg-background/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className="mt-0.5 font-heading text-lg font-bold tabular-nums">
              {Number(stat.value.toFixed(2))}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        共 {points.length} 点 ·{" "}
        <TimeText iso={new Date(points[0].t).toISOString()} relative={false} />
        {" → "}
        <TimeText iso={new Date(points[points.length - 1].t).toISOString()} relative={false} />
      </p>
      <ChartContainer config={HISTORY_CONFIG} className="mt-2 h-[260px] w-full">
        <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="t"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
            tickFormatter={(value: number) => new Date(value).toLocaleTimeString("zh-CN", { hour12: false })}
          />
          <YAxis tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => new Date(Number(value)).toLocaleString("zh-CN", { hour12: false })}
              />
            }
          />
          <defs>
            <linearGradient id="mqtt-history-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-v)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--color-v)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke="var(--color-v)"
            fill="url(#mqtt-history-fill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function NewAccountDialog({
  status,
  accounts,
  otaProjects,
}: {
  status: MqttStatusView;
  accounts: MqttAccountView[];
  otaProjects: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<MqttActionResult | null, FormData>(
    createAccountAction,
    null,
  );
  /** 提交时的表单值：快照还没刷新时，下载的连接说明也能带上自定义前缀/OTA 项目 */
  const [draft, setDraft] = useState({ prefix: "", note: "", otaProject: "", anyTopic: false });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" />
          新建账号
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建设备账号</DialogTitle>
          <DialogDescription>
            一台设备一个账号；密码自动生成且<strong className="text-foreground">只显示一次</strong>，
            生成后可直接下载一份「连接说明」文档（含密码与固件示例）。
          </DialogDescription>
        </DialogHeader>

        {state?.ok && state.password ? (
          <div className="space-y-3">
            <OneTimePassword
              status={status}
              password={state.password}
              issue="created"
              account={(() => {
                const created = accounts.find((item) => item.username === state.username);
                return {
                  username: state.username ?? "",
                  prefix: created?.prefix ?? (draft.prefix || `wgl/${state.username ?? ""}/`),
                  note: created?.note ?? draft.note,
                  otaProject: created?.otaProject ?? draft.otaProject,
                  allowAnyTopic: created?.allowAnyTopic ?? draft.anyTopic,
                  enabled: created?.enabled ?? true,
                };
              })()}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              固件里要改的字段、MQTTX 该怎么填、示例代码与排查表，都在上面这份「连接说明」里。
              以后想再拿一份（不含密码），到「设备」页签的账号行点下载图标即可。
            </p>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </div>
        ) : (
          <form
            action={action}
            className="space-y-3"
            onSubmit={(event) => {
              const data = new FormData(event.currentTarget);
              const project = String(data.get("otaProject") ?? "");
              setDraft({
                prefix: String(data.get("prefix") ?? "").trim(),
                note: String(data.get("note") ?? "").trim(),
                otaProject: project === "none" ? "" : project,
                anyTopic: String(data.get("allowAnyTopic") ?? "") === "on",
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="mqtt-username">用户名</Label>
              <Input
                id="mqtt-username"
                name="username"
                required
                placeholder="如 esp32-keting"
                autoComplete="off"
                defaultValue={state?.values?.username ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mqtt-prefix">主题前缀（留空 = 自动 wgl/&lt;用户名&gt;/）</Label>
              <Input
                id="mqtt-prefix"
                name="prefix"
                placeholder="wgl/esp32-keting/"
                autoComplete="off"
                defaultValue={state?.values?.prefix ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mqtt-note">备注</Label>
              <Input id="mqtt-note" name="note" placeholder="如 客厅温湿度" autoComplete="off" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ota-project">OTA 项目（可选：设备问 wgl/&lt;设备&gt;/ota 时回复它）</Label>
              <Select name="otaProject" defaultValue={"none"}>
                <SelectTrigger id="ota-project" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不绑定</SelectItem>
                  {otaProjects.map((project) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="mqtt-any-topic" name="allowAnyTopic" defaultChecked={false} />
              <Label htmlFor="mqtt-any-topic">
                允许任意主题
                <span className="ml-1.5 text-xs text-muted-foreground">
                  （测试用：不限制 wgl/&lt;用户名&gt;/ 前缀）
                </span>
              </Label>
            </div>

            {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "创建中…" : "创建并生成密码"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({ account, otaProjects }: { account: MqttAccountView; otaProjects: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<MqttActionResult | null, FormData>(
    updateAccountAction,
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑账号</DialogTitle>
          <DialogDescription>改名/改前缀后，设备需要用新用户名重新连接。</DialogDescription>
        </DialogHeader>
        {state?.ok ? (
          <div className="space-y-3">
            <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs">
              {state.notice ?? "已保存"}
            </p>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={account.id} />
            <div className="space-y-1.5">
              <Label htmlFor={`u-${account.id}`}>用户名</Label>
              <Input id={`u-${account.id}`} name="username" required defaultValue={account.username} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`p-${account.id}`}>主题前缀</Label>
              <Input id={`p-${account.id}`} name="prefix" defaultValue={account.prefix} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`n-${account.id}`}>备注</Label>
              <Input id={`n-${account.id}`} name="note" defaultValue={account.note} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ota-project">OTA 项目（可选：设备问 wgl/&lt;设备&gt;/ota 时回复它）</Label>
              <Select name="otaProject" defaultValue={account.otaProject || "none"}>
                <SelectTrigger id="ota-project" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不绑定</SelectItem>
                  {otaProjects.map((project) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch id={`any-${account.id}`} name="allowAnyTopic" defaultChecked={account.allowAnyTopic} />
              <Label htmlFor="`any-${account.id}`">
                允许任意主题
                <span className="ml-1.5 text-xs text-muted-foreground">
                  （测试用：不限制 wgl/&lt;用户名&gt;/ 前缀）
                </span>
              </Label>
            </div>


            <div className="flex items-center gap-2">
              <Switch id={`e-${account.id}`} name="enabled" defaultChecked={account.enabled} />
              <Label htmlFor={`e-${account.id}`}>启用该账号</Label>
            </div>
            {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordButton({
  id,
  username,
  status,
  accounts,
}: {
  id: string;
  username: string;
  status: MqttStatusView;
  accounts: MqttAccountView[];
}) {
  const [state, action, pending] = useActionState<MqttActionResult | null, FormData>(
    resetPasswordAction,
    null,
  );
  return (
    <>
      <form action={action} className="inline">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant="outline" disabled={pending} title="重置密码">
          {pending ? "…" : "重置密码"}
        </Button>
      </form>
      {state?.ok && state.password ? (
        <Dialog open onOpenChange={() => undefined}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>「{username}」的新密码</DialogTitle>
              <DialogDescription>
                只显示这一次，请立刻保存（或直接下载连接说明，密码已写进示例）。
              </DialogDescription>
            </DialogHeader>
            <OneTimePassword
              status={status}
              password={state.password}
              issue="reset"
              account={
                accounts.find((item) => item.id === id) ?? {
                  username,
                  prefix: `wgl/${username}/`,
                  note: "",
                  otaProject: "",
                  allowAnyTopic: false,
                  enabled: true,
                }
              }
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function DeleteAccountButton({ id, username }: { id: string; username: string }) {
  const [, action, pending] = useActionState<MqttActionResult | null, FormData>(
    deleteAccountAction,
    null,
  );
  const { confirm, confirmDialog } = useConfirm();
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        title="删除账号"
        aria-label={`删除账号 ${username}`}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={async () => {
          const ok = await confirm({
            title: `删除账号「${username}」？`,
            description: "该设备将无法连接，账号配置不可恢复。",
            confirmLabel: "删除账号",
          });
          if (!ok) return;
          const formData = new FormData();
          formData.set("id", id);
          action(formData);
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
      {confirmDialog}
    </>
  );
}

function BrokerSettings({ status }: { status: MqttStatusView }) {
  const [state, action, pending] = useActionState<MqttActionResult | null, FormData>(
    saveSettingsAction,
    null,
  );
  const { confirm, confirmDialog } = useConfirm();
  // 取消「停用」后重建 Switch，让开关视觉回到服务器真实状态
  const [switchEpoch, setSwitchEpoch] = useState(0);
  return (
    <SectionCard
      icon={Power}
      title="Broker 设置"
      hint="改端口或开关会重启 broker（已连接的设备需重连）"
    >
      {/* key：服务端状态变化后重建表单，避免开关状态与真实状态不一致 */}
      <form
        key={String(status.enabled)}
        action={action}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = form.elements.namedItem("enabled") as HTMLInputElement | null;
          const next = Boolean(input?.checked);
          void (async () => {
            if (!next && status.enabled) {
              const ok = await confirm({
                title: "停用 MQTT 服务器？",
                description: "已连接的设备会立刻掉线。",
                confirmLabel: "停用",
              });
              if (!ok) {
                // 取消：把开关恢复成服务器真实状态
                if (input) input.checked = status.enabled;
                setSwitchEpoch((k) => k + 1);
                return;
              }
            }
            action(new FormData(form));
          })();
        }}
      >
        <div className="grid gap-3 lg:grid-cols-2 wgl-cells">
          {/* MQTT over TCP */}
          <div className="rounded-2xl border border-border/70 bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Radio className="size-4 text-primary" />
                MQTT（TCP）
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                  status.listening ? "border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", status.listening ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                {status.listening ? "已监听" : status.enabled ? "未监听" : "已停用"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              设备走 <span className="font-mono">mqtt://</span> 直连（内网 / EasyTier）
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2">
                <Switch key={`enabled-${switchEpoch}`} id="mqtt-enabled" name="enabled" defaultChecked={status.enabled} />
                <Label htmlFor="mqtt-enabled">启用</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mqtt-port">端口</Label>
                <Input
                  id="mqtt-port"
                  name="port"
                  type="number"
                  min={1024}
                  max={65535}
                  defaultValue={status.port}
                  className="w-28"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">容器需映射同端口（compose 的 MQTT_PORT）</p>
          </div>

          {/* MQTT over WebSocket */}
          <div className="rounded-2xl border border-border/70 bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Globe className="size-4 text-primary" />
                MQTT over WebSocket
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                  status.wsListening ? "border-emerald-500/40 text-emerald-500" : "border-amber-500/40 text-amber-500",
                )}
              >
                <span className={cn("size-1.5 rounded-full", status.wsListening ? "bg-emerald-500" : "bg-amber-500")} />
                {status.wsListening ? "已监听" : status.wsEnabled ? (status.wsError ?? "未监听") : "未开启"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              设备走 <span className="font-mono">wss://域名</span>，由公网机 Caddy 反代到本机
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2">
                <Switch id="mqtt-ws-enabled" name="wsEnabled" defaultChecked={status.wsEnabled} />
                <Label htmlFor="mqtt-ws-enabled">启用</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mqtt-ws-port">端口</Label>
                <Input
                  id="mqtt-ws-port"
                  name="wsPort"
                  type="number"
                  min={1024}
                  max={65535}
                  defaultValue={status.wsPort}
                  className="w-28"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mqtt-ws-path">公网路径</Label>
                <Input
                  id="mqtt-ws-path"
                  name="wsPath"
                  defaultValue={status.publicWsUrl ? new URL(status.publicWsUrl).pathname : "/mqtt-ws"}
                  placeholder="/mqtt-ws"
                  autoComplete="off"
                  className="w-32 font-mono text-xs"
                />
              </div>
            </div>
            <p className="mt-2 truncate text-[11px] text-muted-foreground">
              {status.publicWsUrl ? (
                <>
                  公网地址 <span className="font-mono text-foreground">{status.publicWsUrl}</span>
                  {" "}（路径要与公网机 Caddy 的 handle 一致）
                </>
              ) : (
                <>路径要与公网机 Caddy 的 handle 一致（配了 SITE_URL 才显示完整公网地址）</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "保存中…" : "保存并重启"}
          </Button>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          {state?.notice ? <p className="text-xs text-muted-foreground">{state.notice}</p> : null}
        </div>
      </form>
      {confirmDialog}
    </SectionCard>
  );
}
