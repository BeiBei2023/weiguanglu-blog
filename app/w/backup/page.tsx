import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Archive, HardDrive } from "lucide-react";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { readBackupIndex, stampLabel, type Snapshot } from "@/lib/backup-index";
import { readBackupStatus } from "@/lib/sysinfo";
import { formatBytes, formatClock } from "@/lib/format";

export const metadata: Metadata = { title: "备份浏览" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<Snapshot["kind"], string> = {
  site: "站点（工作副本：content / data / 配置）",
  git: "git 仓库（bare，完整历史）",
};



function restoreCommands(stamp: string): string {
  return [
    "mkdir -p /tmp/snap && cd /tmp/snap",
    `rclone copy bg:/blog/archive/ . \\`,
    `  --include "blog-site-${stamp}.tar.gz.part-*" \\`,
    `  --include "SHA256SUMS-${stamp}.txt"`,
    `sha256sum -c SHA256SUMS-${stamp}.txt`,
    `cat blog-site-${stamp}.tar.gz.part-* > site.tar.gz`,
    "tar -xzf site.tar.gz -C /srv/blog-restore",
  ].join("\n");
}

export default async function BackupPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/backup");

  const index = readBackupIndex();
  const backup = readBackupStatus();

  const groups = new Map<string, Snapshot[]>();
  for (const snapshot of index.snapshots) {
    const list = groups.get(snapshot.stamp) ?? [];
    list.push(snapshot);
    groups.set(snapshot.stamp, list);
  }
  const stamps = [...groups.keys()].sort().reverse();

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <Archive className="h-5 w-5 text-primary" />
          备份浏览
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          123 云盘 <span className="font-mono">bg:/blog/archive/</span> 上的全量归档快照：每 12
          小时一份，保留最近 14 份；每卷都有 sha256，可随时取回恢复。
        </p>
      </header>

      <div className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl p-4 text-xs">
        <span className="flex items-center gap-1.5">
          <HardDrive className="size-3.5 text-primary" />
          清单生成于
          <span className="tabular-nums">{index.at ? formatClock(index.at) : "—"}</span>
        </span>
        <span className="text-muted-foreground">快照 {stamps.length} 组</span>
        <span className="text-muted-foreground">归档合计 {formatBytes(index.totalBytes)}</span>
        <span className="text-muted-foreground">校验和文件 {index.checksums.length} 个</span>
      </div>

      {backup?.ok === false ? (
        <div className="glass rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-xs">
          <p className="font-medium text-destructive">
            ⚠ 最近一次备份没送达云端{backup.at ? `（${formatClock(backup.at)}）` : ""}
          </p>
          {backup.logTail ? (
            <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
              {backup.logTail}
            </p>
          ) : null}
          {/401|Unauthorized/i.test(backup.logTail ?? "") ? (
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              日志里出现 <span className="font-mono">401 Unauthorized</span>：多半是 123 云盘 WebDAV
              应用密码失效——去 123云盘「工具中心 → 第三方挂载 → WebDAV 授权管理」重新生成，再在服务器执行{" "}
              <span className="font-mono">sudo rclone config update bg --webdav-pass &lt;新密码&gt;</span>
              ；详见 文档/DEPLOY.md 第 6 章。
            </p>
          ) : /归档|tar|file changed/i.test(backup.logTail ?? "") ? (
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              日志里是<b>归档（tar）</b>相关的告警：多为打包时 <span className="font-mono">data/</span>{" "}
              正被容器写入触发的「文件发生了变化」（良性，归档本身通常完整）。看云盘 archive
              目录里对应时间戳的文件大小是否正常，可照常使用；持续失败时详见 文档/DEPLOY.md 第 6 章。
            </p>
          ) : (
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              看上面日志里带 <span className="font-mono">ERROR</span> /{" "}
              <span className="font-mono">警告：</span> 的那几行定位；常见原因是 WebDAV 授权失效或归档打包告警，
              详见 文档/DEPLOY.md 第 6 章。
            </p>
          )}
        </div>
      ) : backup ? (
        <p className="glass rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs text-emerald-600 dark:text-emerald-400">
          ✓ 最近一次备份已送达云端{backup.at ? `（${formatClock(backup.at)}）` : ""}
        </p>
      ) : null}

      {index.error ? (
        <p className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          {index.error}（下一次备份跑完就会写入清单）
        </p>
      ) : null}

      {stamps.length === 0 && !index.error ? (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          还没有归档快照。备份脚本每 12 小时跑一轮，跑完这里就会出现。
        </p>
      ) : null}

      <ul className="space-y-4">
        {stamps.map((stamp) => {
          const snapshots = groups.get(stamp) ?? [];
          const total = snapshots.reduce((sum, item) => sum + item.bytes, 0);
          return (
            <li key={stamp} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-base font-semibold">{stampLabel(stamp)}</h2>
                <span className="font-mono text-xs text-muted-foreground">{stamp}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatBytes(total)}</span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 wgl-cells">
                {snapshots.map((snapshot) => (
                  <div key={`${snapshot.kind}-${snapshot.stamp}`} className="rounded-2xl bg-accent/40 p-3">
                    <p className="text-xs font-medium">{KIND_LABEL[snapshot.kind]}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(snapshot.bytes)} · {snapshot.files.length} 个分卷
                    </p>
                    <ul className="mt-2 space-y-0.5">
                      {snapshot.files.map((file) => (
                        <li key={file.name} className="truncate font-mono text-[11px] text-muted-foreground" title={file.name}>
                          {file.name} · {formatBytes(file.bytes)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  恢复这一份（点开看命令）
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-2xl bg-black/30 p-3 font-mono text-[11px] leading-relaxed">
                  {restoreCommands(stamp)}
                </pre>
              </details>
            </li>
          );
        })}
      </ul>

      {index.checksums.length > 0 ? (
        <section className="glass rounded-2xl p-5">
          <h2 className="font-heading text-base font-semibold">校验和文件</h2>
          <ul className="mt-2 space-y-1">
            {index.checksums.map((file) => (
              <li key={file.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatBytes(file.bytes)} · {formatClock(file.modtime)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        说明：123 云盘的 WebDAV 不支持哈希、也不保存修改时间，所以「镜像同步」只能按体积判断变化；真正
        完整可靠的是这里的归档快照（文件名带时间戳，每次都是新文件）。单个文件上限 1 GB，因此归档按 900 MB 分卷。
      </p>
    </div>
  );
}
