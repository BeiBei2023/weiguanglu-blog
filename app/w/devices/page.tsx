import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Cpu, Radio } from "lucide-react";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { Badge } from "@/components/ui/badge";
import { getServerSession } from "@/lib/auth/server";
import { mqttCommands, mqttDevices, mqttStatus } from "@/lib/mqtt/broker";
import { readMqttConfig } from "@/lib/mqtt/store";
import { formatClock, formatAgo } from "@/lib/format";

export const metadata: Metadata = { title: "设备台账" };
export const dynamic = "force-dynamic";



export default async function DevicesPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/devices");

  const config = readMqttConfig();
  const status = mqttStatus();
  const devices = mqttDevices();
  const commands = mqttCommands();

  const rows = config.accounts.map((account) => {
    const view = devices.find((item) => item.username === account.username) ?? null;
    const recent = commands
      .filter((item) => item.device === account.username && !item.auto)
      .slice(0, 3);
    return { account, view, recent };
  });

  const onlineCount = rows.filter((row) => row.view?.online).length;

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <Cpu className="h-5 w-5 text-primary" />
          设备台账
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每个 MQTT 账号对应一台设备：在线状态、最后上报、绑定的固件项目与最近命令回执都在这里。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="glass rounded-full px-3 py-1">
          账号 {config.accounts.length} 个 · 在线 {onlineCount}
        </span>
        <span className="glass rounded-full px-3 py-1">
          broker {status.enabled ? (status.listening ? `运行中 · ${status.port}` : "已启用未监听") : "已停用"}
        </span>
        <Link href="/w/mqtt" className="glass rounded-full px-3 py-1 hover:text-foreground">
          去 MQTT 面板 →
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          还没有设备账号。到 <Link href="/w/mqtt" className="text-primary hover:underline">MQTT 面板</Link> 里新建一个。
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ account, view, recent }) => (
            <li key={account.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 font-heading text-sm font-semibold text-primary">
                  {account.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-heading text-sm font-semibold">{account.username}</span>
                <Badge
                  variant="outline"
                  className={
                    !account.enabled
                      ? "text-[10px] text-muted-foreground"
                      : view?.online
                        ? "border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                        : "text-[10px] text-muted-foreground"
                  }
                >
                  {!account.enabled ? "已停用" : view?.online ? "在线" : "离线"}
                </Badge>
                {account.allowAnyTopic ? (
                  <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                    任意主题
                  </Badge>
                ) : null}
                <span className="ml-auto font-mono text-xs text-muted-foreground">{account.prefix}</span>
              </div>

              {account.note ? (
                <p className="mt-2 text-xs text-muted-foreground">{account.note}</p>
              ) : null}

              <div className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 wgl-cells">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">最后上线</span>
                  <span className="tabular-nums">
                    {formatClock(account.lastSeenAt ?? view?.lastAt)} {formatAgo(account.lastSeenAt ?? view?.lastAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">累计发布</span>
                  <span className="tabular-nums">{account.published ?? 0} 条</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">当前状态</span>
                  <span className="truncate">{view?.status ? view.status : "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">固件项目</span>
                  {account.otaProject ? (
                    <Link href="/w/ota" className="text-primary hover:underline">
                      {account.otaProject}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">未绑定</span>
                  )}
                </div>
                {view?.runtime ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">连接</span>
                      <span className="font-mono text-[11px]">
                        {view.runtime.ip} · {formatClock(view.runtime.connectedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">订阅</span>
                      <span className="truncate font-mono text-[11px]">
                        {view.runtime.subscriptions.length > 0
                          ? view.runtime.subscriptions.join(", ")
                          : "无"}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              {recent.length > 0 ? (
                <div className="mt-3 border-t border-border/60 pt-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Radio className="h-3 w-3" />
                    最近命令
                  </p>
                  <ul className="mt-1 space-y-1">
                    {recent.map((command) => (
                      <li key={command.id} className="flex items-center gap-2 text-[11px]">
                        <span className="tabular-nums text-muted-foreground">{formatClock(command.at)}</span>
                        <span className="min-w-0 flex-1 truncate font-mono">{command.topic}</span>
                        <Badge
                          variant="outline"
                          className={
                            command.ackedAt
                              ? "border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                              : "text-[10px] text-muted-foreground"
                          }
                        >
                          {command.ackedAt ? "已回执" : "等待回执"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        设备主动上报的数值曲线在 <Link href="/w/mqtt" className="text-primary hover:underline">MQTT 面板 → 数据</Link>；固件版本与升级记录在{" "}
        <Link href="/w/ota" className="text-primary hover:underline">OTA 面板</Link>。
      </p>
    </div>
  );
}
