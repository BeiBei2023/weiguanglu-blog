import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FileText, LayoutGrid } from "lucide-react";
import { getServerSession } from "@/lib/auth/server";
import { SERVICES } from "@/lib/services/registry";
import { sysSummary } from "@/lib/sysinfo";
import { tempTone } from "@/lib/temps";
import { readHot } from "@/lib/hot";
import { readInventory } from "@/lib/inventory/store";
import { cn } from "cn";
import { formatAgo, formatBytes } from "@/lib/format";
import { CountUp } from "@/components/w/metric-number";

export const metadata = {
  title: "工作站",
};

export const dynamic = "force-dynamic";

/** 十格刻度轨：把百分比画成看得见的量 */
function Gauge({ ratio, tone }: { ratio: number | null; tone?: "warn" | "danger" }) {
  const filled = ratio === null ? 0 : Math.max(ratio > 0 ? 1 : 0, Math.round(ratio * 10));
  return (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: 10 }).map((_, index) => (
        <span
          key={index}
          style={{ animationDelay: `${index * 45}ms` }}
          className={cn(
            "h-3.5 flex-1 rounded-[2px]",
            index < filled
              ? cn(
                  "wgl-gauge-seg",
                  tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500",
                )
              : "bg-muted",
          )}
        />
      ))}
    </span>
  );
}

/** 统一卡片规格：半透明玻璃 + 悬停抬升 + 描边变橙 */
const CARD =
  "glass group flex flex-col rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60";

/**
 * 卡片顺序（「机架优先」）：
 * 机器（状态 / 体检 / 备份）→ 设备与固件（MQTT / 台账）→ 库存主角 + 热点
 * → 业务数据（阅读 / 评论 / 素材）→ 配置与小工具（节日 / 天气 / 文档 / 片段）
 */
const ORDER = [
  "status",
  "health",
  "backup",
  "inventory",
  "mqtt",
  "devices",
  "hot",
  "ota",
  "views",
  "comments",
  "images",
  "festivals",
  "weather",
  "docs",
  "snippets",
];

/** 需要占两格的卡片（读数多或想当主角的） */
const WIDE = new Set(["status", "hot"]);

export default async function WorkspacePage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w");

  const summary = await sysSummary();
  const { modules, content, disks, backup } = summary;
  const systemDisk = disks[0];
  const usageRatio = systemDisk?.ok ? systemDisk.percent : null;
  const usagePercent = usageRatio === null ? null : Math.round(usageRatio * 100);
  const diskTone =
    usageRatio !== null && usageRatio >= 0.9 ? "danger" : usageRatio !== null && usageRatio >= 0.75 ? "warn" : undefined;

  // 温度：CPU 读数条 + 主板 / 硬盘温度进 hint
  const temps = summary.temps;
  const cpuTemp = temps.cpuPackage;
  const cpuTone = tempTone(cpuTemp);
  const boardMax = temps.board.length > 0 ? Math.max(...temps.board) : null;

  const hot = readHot();
  const hotSources = (hot?.sources ?? []).filter((source) => source.items.length > 0);
  const hotCount = hotSources.reduce((total, source) => total + source.items.length, 0);
  const hotLead = hotSources[0]?.items[0];
  const hotLeadSource = hotSources[0]?.name ?? "";
  const backupOk = backup.status ? backup.status.ok !== false : true;

  // 库存健康度（正常 / 低库存 / 停用）——给工作台主角卡补读数
  const inventory = await readInventory();
  const invTotal = inventory.components.length;
  const invDisabled = inventory.components.filter((component) => !component.enabled).length;
  const invLow = inventory.components.filter(
    (component) => component.enabled && component.quantity < inventory.settings.lowStockThreshold,
  ).length;
  const invOk = Math.max(0, invTotal - invDisabled - invLow);
  const invCategories = new Set(
    inventory.components.map((component) => component.category).filter(Boolean),
  ).size;
  const invPct = (count: number) => (invTotal ? (count / invTotal) * 100 : 0);
  const invOkPct = invTotal ? Math.round((invOk / invTotal) * 100) : 0;
  const invLowEnd = invPct(invOk) + invPct(invLow);
  const invDonut = `conic-gradient(#10b981 0% ${invPct(invOk)}%, #f59e0b ${invPct(invOk)}% ${invLowEnd}%, color-mix(in oklab, var(--muted-foreground) 45%, transparent) ${invLowEnd}% 100%)`;

  /** 服务卡右侧/下方显示的实时读数（没有就不显示） */
  const reading: Record<string, string> = {
    inventory: modules.inventory.ok ? String(modules.inventory.components) : "",
    ota: modules.ota.ok ? `${modules.ota.projects} 项目` : "",
    mqtt: modules.mqtt.ok ? `${modules.mqtt.online} 在线` : "",
    views: modules.views.ok ? `${modules.views.total} 次` : "",
    status: usagePercent === null ? "" : `${usagePercent}%`,
    images: `${content.images} 个`,
    backup: backup.status?.at ? formatAgo(backup.status.at) : "",
    hot: hotCount ? `${hotCount} 条` : "",
  };

  /** 按 ORDER 排好（注册表里将来新增、还没排进 ORDER 的服务自动落到末尾） */
  const ordered = [
    ...ORDER.flatMap((id) => SERVICES.filter((service) => service.id === id)),
    ...SERVICES.filter((service) => !ORDER.includes(service.id)),
  ];

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <LayoutGrid className="h-6 w-6 text-primary" />
            工作台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            私人工具箱与数据看板 · {content.posts} 篇文章 · {SERVICES.length} 项服务
          </p>
        </div>
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <FileText className="h-3.5 w-3.5" />
          文章后台
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      {SERVICES.length === 0 ? (
        <div className="glass flex min-h-[40vh] flex-col items-center justify-center rounded-2xl p-10 text-center">
          <LayoutGrid className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-heading text-lg font-semibold">还没有服务</p>
          <p className="mt-1 text-sm text-muted-foreground">
            在 <code className="rounded bg-muted px-1.5 py-0.5">lib/services/registry.ts</code> 里注册一项，
            这里就会出现入口。
          </p>
        </div>
      ) : (
        <div className="wgl-cells grid auto-rows-[minmax(96px,auto)] grid-cols-2 gap-3 xl:grid-cols-4">
          {ordered.map((service) => {
            // 主角：元器件仓库 2×2
            if (service.id === "inventory") {
              return (
                <Link
                  key={service.id}
                  href={service.href}
                  className={cn(CARD, "col-span-2 row-span-2 justify-between border-primary/30")}
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <service.icon className="h-3.5 w-3.5" />
                    元器件仓库
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 transition-colors group-hover:text-primary" />
                  </span>
                  <span className="flex flex-1 items-center gap-4">
                    <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <span>
                        <span className="block font-heading text-[40px] font-bold leading-none tabular-nums">
                          <CountUp text={modules.inventory.ok ? String(modules.inventory.components) : "—"} />
                        </span>
                        <span className="mt-1.5 block text-xs text-muted-foreground">
                          {modules.inventory.ok
                            ? `${modules.inventory.boxes} 个容器 · ${invCategories} 个分类`
                            : (modules.inventory.error ?? "读取失败")}
                        </span>
                      </span>

                      <span className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          正常 <span className="font-medium tabular-nums text-foreground">{invOk}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          低库存 <span className="font-medium tabular-nums text-foreground">{invLow}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                          停用 <span className="font-medium tabular-nums text-foreground">{invDisabled}</span>
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        进库存
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </span>

                    {/* 健康度圆饼：正常（绿）/ 低库存（琥珀）/ 停用（灰）；右移一点，不贴卡片边 */}
                    <span
                      aria-hidden
                      className="relative mr-4 grid h-[180px] w-[180px] shrink-0 place-items-center rounded-full"
                      style={{ background: invDonut }}
                    >
                      <span className="flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full bg-background/80 backdrop-blur-sm">
                        <span className="font-heading text-[32px] font-bold leading-none tabular-nums">
                          {invOkPct}%
                        </span>
                        <span className="mt-1.5 text-[11px] text-muted-foreground">正常率</span>
                      </span>
                    </span>
                  </span>
                </Link>
              );
            }

            const value = reading[service.id];
            return (
              <Link
                key={service.id}
                href={service.href}
                className={cn(CARD, WIDE.has(service.id) && "col-span-2")}
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <service.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{service.name}</span>
                  {service.status === "dev" ? (
                    <span className="shrink-0 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                      开发中
                    </span>
                  ) : null}
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </span>

                {value ? (
                  <span
                    className={cn(
                      "mt-2 block font-heading text-2xl font-bold tabular-nums",
                      service.id === "status" && diskTone === "danger" && "text-destructive",
                      service.id === "status" && diskTone === "warn" && "text-amber-600 dark:text-amber-400",
                      service.id === "backup" && !backupOk && "text-destructive",
                    )}
                  >
                    <CountUp text={value} />
                  </span>
                ) : null}

                {service.id === "status" ? (
                  <span className="mt-2 block">
                    <Gauge ratio={usageRatio} tone={diskTone} />
                  </span>
                ) : null}

                {service.id === "status" && cpuTemp !== null ? (
                  <span className="mt-2 block">
                    <span className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CPU 温度</span>
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          cpuTone === "danger" && "text-destructive",
                          cpuTone === "warn" && "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {cpuTemp}℃
                      </span>
                    </span>
                    <Gauge ratio={cpuTemp / 100} tone={cpuTone === "ok" ? undefined : cpuTone} />
                  </span>
                ) : null}

                {service.id === "status" ? (
                  <span className="mt-1.5 block text-[11px] text-muted-foreground">
                    {systemDisk?.ok ? `剩余 ${formatBytes(systemDisk.freeBytes)}` : "无法读取"}
                    {boardMax !== null ? ` · 主板 ${boardMax}℃` : ""}
                    {temps.diskMax !== null ? ` · 盘 ${temps.diskMax}℃` : ""}
                  </span>
                ) : null}

                {service.id === "backup" ? (
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", backupOk ? "bg-emerald-500" : "bg-destructive")} />
                    {backup.status ? (backup.status.ok === false ? "上次失败" : "正常") : "暂无记录"}
                  </span>
                ) : null}

                {service.id === "hot" && hotLead ? (
                  <span className="mt-1 block truncate text-xs text-muted-foreground" title={hotLead.title}>
                    {hotLeadSource} · {hotLead.title}
                  </span>
                ) : null}

                <span className="mt-auto pt-2 line-clamp-2 text-xs text-muted-foreground">
                  {service.description}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
