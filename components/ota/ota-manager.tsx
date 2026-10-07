"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Trash2, Upload } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { FirmwareInfo } from "@/lib/ota";

export interface OtaManagerProps {
  projects: string[];
  selected: string | null;
  active: FirmwareInfo | null;
  history: FirmwareInfo[];
  baseUrl: string;
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 flex-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

export function OtaManager({ projects, selected, active, history, baseUrl }: OtaManagerProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const downloadUrl = selected ? `${baseUrl}/api/ota/${selected}/firmware.bin` : "";

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    await run(async () => {
      const res = await fetch("/api/w/ota/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      form.reset();
      router.push(`/w/ota?p=${encodeURIComponent(name)}`);
      router.refresh();
    }, `已创建项目「${name}」`);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("firmware");
    if (!(file instanceof File) || file.size === 0) {
      setError("请选择 .bin 固件文件");
      return;
    }
    await run(async () => {
      const res = await fetch(`/api/w/ota/${encodeURIComponent(selected)}/upload`, {
        method: "POST",
        body: data,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "上传失败");
      form.reset();
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    }, "固件上传成功并已激活");
  }

  async function switchTo(ts: string) {
    if (!selected) return;
    const ok = await confirm({
      title: `切换到版本 ${ts}？`,
      description: "设备下次检查更新时会下载该版本。",
      confirmLabel: "切换",
      destructive: false,
    });
    if (!ok) return;
    await run(async () => {
      const res = await fetch(`/api/w/ota/${encodeURIComponent(selected)}/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "切换失败");
      router.refresh();
    }, `已切换到 ${ts}`);
  }

  async function removeHistory(ts: string) {
    if (!selected) return;
    const ok = await confirm({
      title: `删除历史版本 ${ts}？`,
      description: "固件文件会被删除，不可撤销。",
      confirmLabel: "删除",
    });
    if (!ok) return;
    await run(async () => {
      const res = await fetch(`/api/w/ota/${encodeURIComponent(selected)}/delete-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "删除失败");
      router.refresh();
    }, `已删除 ${ts}`);
  }

  async function removeProject() {
    if (!selected) return;
    const ok = await confirm({
      title: `删除项目「${selected}」？`,
      description: "该项目及其全部固件都会被删除，不可撤销。",
      confirmLabel: "删除项目",
    });
    if (!ok) return;
    await run(async () => {
      const res = await fetch(`/api/w/ota/${encodeURIComponent(selected)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "删除失败");
      router.push("/w/ota");
      router.refresh();
    }, "项目已删除");
  }

  async function run(task: () => Promise<void>, okMessage: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      setNotice(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("复制失败，请手动选择");
    }
  }

  return (
    <div className="space-y-5">
      {confirmDialog}
      {/* 项目栏 */}
      <div className="glass rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          {projects.map((name) => (
            <Link
              key={name}
              href={`/w/ota?p=${encodeURIComponent(name)}`}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                name === selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {name}
            </Link>
          ))}
          <form onSubmit={createProject} className="ml-auto flex items-center gap-2">
            <input
              name="name"
              placeholder="新项目名（字母/数字/-/_）"
              className="w-56 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              新建项目
            </button>
          </form>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {!selected ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          还没有项目。先在上方「新建项目」，再上传 `.bin` 固件。
        </div>
      ) : (
        <>
          {/* 当前固件 */}
          <div className="glass rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base font-bold">
                {selected}
                <span className="ml-2 text-xs font-normal text-muted-foreground">当前固件</span>
              </h2>
              <button
                type="button"
                onClick={removeProject}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs text-destructive transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除项目
              </button>
            </div>

            {active ? (
              <div className="mt-3 divide-y divide-border/60">
                <Row
                  label="版本"
                  value={active.customVersion || active.appVersion || active.version}
                />
                <Row label="芯片" value={active.isEsp32 ? active.chip : "非 ESP32 固件"} />
                <Row label="应用名" value={active.projectName} />
                <Row label="IDF" value={active.idfVer} />
                <Row label="编译时间" value={active.compileTime} />
                <Row label="Flash" value={[active.flashMode, active.flashFreq, active.flashSize].filter(Boolean).join(" · ")} />
                <Row label="入口" value={active.entryAddr} mono />
                <Row label="大小" value={active.sizeStr} />
                <Row label="MD5" value={active.md5} mono />
                <Row label="上传时间" value={active.uploadTime} />
                {active.notes ? <Row label="备注" value={active.notes} /> : null}

                <div className="pt-3">
                  <p className="mb-1 text-xs text-muted-foreground">设备下载地址</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-transparent px-3 py-1.5 font-mono text-xs">
                      {downloadUrl}
                    </code>
                    <button
                      type="button"
                      onClick={copyUrl}
                      aria-label="复制"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "已复制" : "复制"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    也兼容旧路径 <code className="font-mono">/project/{selected}/firmware.bin</code> 与{" "}
                    <code className="font-mono">/firmware.bin</code>
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                该项目还没有固件。上传一个 `.bin` 即可自动解析并激活。
              </p>
            )}
          </div>

          {/* 上传 */}
          <form onSubmit={upload} className="glass rounded-2xl p-5 sm:p-6">
            <h2 className="font-heading text-base font-bold">上传固件</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm text-muted-foreground">固件文件（.bin，≤32MB）</span>
                <input
                  ref={fileRef}
                  type="file"
                  name="firmware"
                  accept=".bin,application/octet-stream"
                  className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">自定义版本号（可选）</span>
                <input
                  name="customVersion"
                  placeholder="如 v1.2.0"
                  className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">备注（可选）</span>
                <input
                  name="notes"
                  placeholder="如 修复配网超时"
                  className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {busy ? "上传中…" : "上传并激活"}
            </button>
          </form>

          {/* 历史版本 */}
          <div className="glass rounded-2xl p-5 sm:p-6">
            <h2 className="font-heading text-base font-bold">历史版本</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">暂无历史版本。</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {history.map((item) => {
                  const isActive = active ? active.version === item.version : false;
                  return (
                    <li key={item.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                      <span className="text-xs tabular-nums text-muted-foreground">{item.uploadTime}</span>
                      <span className="font-medium">
                        {item.customVersion || item.appVersion || item.version}
                      </span>
                      {isActive ? (
                        <span className="rounded-full border border-primary/50 px-1.5 py-0.5 text-[10px] leading-none text-primary">
                          当前
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{item.sizeStr}</span>
                      {item.notes ? (
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {item.notes}
                        </span>
                      ) : (
                        <span className="flex-1" />
                      )}
                      {!isActive ? (
                        <span className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => switchTo(item.version)}
                            disabled={busy}
                            className="text-xs text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                          >
                            切换
                          </button>
                          <button
                            type="button"
                            onClick={() => removeHistory(item.version)}
                            disabled={busy}
                            className="text-xs text-destructive transition-opacity hover:opacity-80 disabled:opacity-50"
                          >
                            删除
                          </button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
