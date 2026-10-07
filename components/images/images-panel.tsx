"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FileCode,
  FileQuestion,
  Film,
  Link2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  purgeImagesAction,
  purgeTrashAllAction,
  restoreImagesAction,
  saveAltAction,
  trashImagesAction,
} from "@/app/w/images/actions";
import type { MediaItem, MediaStats, TrashItem } from "@/lib/images";
import { formatBytes, formatClock } from "@/lib/format";
import { CountUp } from "@/components/w/metric-number";

/** 与 lib/images.ts 的 MEDIA_PREFIX 保持一致（这里本地实现，避免把 node:fs 带进客户端 chunk） */
const MEDIA_PREFIX = "/content-images/";

function mediaUrl(name: string): string {
  return `${MEDIA_PREFIX}${encodeURIComponent(name)}`;
}

type Filter = "all" | "used" | "unused" | "big";
type Sort = "time" | "name" | "size";

const BIG_BYTES = 1024 * 1024;
/** 同时上传几个文件 */
const CONCURRENCY = 3;



function origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

interface UploadTask {
  id: string;
  name: string;
  size: number;
  status: "wait" | "busy" | "done" | "fail";
  /** 上传成功后的站内路径 */
  result?: string;
  error?: string;
}

export function ImagesPanel({
  items,
  stats,
  trash,
  hotlink,
}: {
  items: MediaItem[];
  stats: MediaStats;
  trash: TrashItem[];
  /** 当前图片防盗链策略（决定外链能否被站外页面引用） */
  hotlink: "off" | "relaxed" | "strict";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("time");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // 上传
  const fileInput = useRef<HTMLInputElement | null>(null);
  const files = useRef(new Map<string, File>());
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [keepName, setKeepName] = useState(false);
  const [autoCopy, setAutoCopy] = useState(true);

  // alt
  const [altName, setAltName] = useState<string | null>(null);
  const [altDraft, setAltDraft] = useState("");
  const [altBusy, setAltBusy] = useState(false);

  // 回收站
  const [trashSelected, setTrashSelected] = useState<string[]>([]);
  const [trashBusy, setTrashBusy] = useState(false);

  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    let list = key ? items.filter((item) => item.name.toLowerCase().includes(key)) : [...items];
    if (filter === "used") list = list.filter((item) => item.refs.length > 0);
    if (filter === "unused") list = list.filter((item) => item.refs.length === 0);
    if (filter === "big") list = list.filter((item) => item.bytes > BIG_BYTES);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "size") list.sort((a, b) => b.bytes - a.bytes);
    else list.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return list;
  }, [items, q, filter, sort]);

  const [visibleCount, setVisibleCount] = useState(24);
  const shown = rows.slice(0, visibleCount);

  const selectedBytes = useMemo(
    () => items.filter((item) => selected.includes(item.name)).reduce((sum, item) => sum + item.bytes, 0),
    [items, selected],
  );
  const rowsBytes = rows.reduce((sum, item) => sum + item.bytes, 0);
  const running = tasks.some((task) => task.status === "wait" || task.status === "busy");

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  function toggle(name: string) {
    setSelected((prev) => (prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]));
  }

  // ── 上传 ──────────────────────────────────────────────────────────

  function patchTask(id: string, patch: Partial<UploadTask>) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  async function uploadOne(id: string): Promise<boolean> {
    const file = files.current.get(id);
    if (!file) return false;
    patchTask(id, { status: "busy", error: undefined });
    try {
      const form = new FormData();
      form.append("file", file);
      if (prefix.trim()) form.append("prefix", prefix.trim());
      if (keepName) form.append("keepName", "1");
      const response = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { path?: string; name?: string; error?: string };
      if (!response.ok || !data.path) throw new Error(data.error ?? `上传失败（HTTP ${response.status}）`);
      patchTask(id, { status: "done", result: data.path });
      if (autoCopy) void copyText(`![](${origin()}${data.path})`, `已复制 ${data.name ?? file.name} 的 Markdown`);
      return true;
    } catch (error) {
      patchTask(id, { status: "fail", error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async function runTasks(ids: string[]) {
    let next = 0;
    const worker = async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= ids.length) return;
        await uploadOne(ids[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    startTransition(() => router.refresh());
  }

  async function addFiles(list: FileList | File[]) {
    const all = Array.from(list).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    if (all.length === 0) {
      toast.error("只支持图片或视频文件");
      return;
    }
    const skip = Array.from(list).length - all.length;
    if (skip > 0) toast.info(`已跳过 ${skip} 个非图片/视频文件`);

    const created: UploadTask[] = all.map((file, index) => {
      const id = `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      files.current.set(id, file);
      return { id, name: file.name, size: file.size, status: "wait" as const };
    });
    setTasks((prev) => [...created, ...prev].slice(0, 60));
    await runTasks(created.map((task) => task.id));
  }

  async function retryFailed() {
    const ids = tasks.filter((task) => task.status === "fail").map((task) => task.id);
    if (ids.length === 0) return;
    await runTasks(ids);
  }

  // ── alt ──────────────────────────────────────────────────────────

  function openAlt(item: MediaItem) {
    setAltName(item.name);
    setAltDraft(item.alt);
  }

  async function saveAlt() {
    if (!altName) return;
    setAltBusy(true);
    const result = await saveAltAction(altName, altDraft);
    setAltBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "保存失败");
      return;
    }
    toast.success(result.notice ?? "已保存");
    setAltName(null);
    startTransition(() => router.refresh());
  }

  // ── 回收站 / 移入回收站 ───────────────────────────────────────────

  async function onTrash() {
    if (selected.length === 0) return;
    const ok = await confirm({
      title: `移入回收站 ${selected.length} 个文件？`,
      description:
        "文件会从 content/images 移到 data/image-trash/，引用它的文章会显示不出图片；想找回在下面的「回收站」里点还原即可。",
      confirmLabel: "移入回收站",
    });
    if (!ok) return;
    setBusy(true);
    const result = await trashImagesAction(selected);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "操作失败");
      return;
    }
    toast.success(result.notice ?? "已移入回收站");
    setSelected([]);
    startTransition(() => router.refresh());
  }

  function toggleTrash(name: string) {
    setTrashSelected((prev) => (prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]));
  }

  async function onRestore() {
    if (trashSelected.length === 0) return;
    setTrashBusy(true);
    const result = await restoreImagesAction(trashSelected);
    setTrashBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "还原失败");
      return;
    }
    toast.success(result.notice ?? "已还原");
    setTrashSelected([]);
    startTransition(() => router.refresh());
  }

  async function onPurge() {
    if (trashSelected.length === 0) return;
    const ok = await confirm({
      title: `彻底删除 ${trashSelected.length} 个文件？`,
      description: "会从 data/image-trash/ 直接删掉，**不能恢复**。",
      confirmLabel: "彻底删除",
      destructive: true,
    });
    if (!ok) return;
    setTrashBusy(true);
    const result = await purgeImagesAction(trashSelected);
    setTrashBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "删除失败");
      return;
    }
    toast.success(result.notice ?? "已删除");
    setTrashSelected([]);
    startTransition(() => router.refresh());
  }

  async function onPurgeAll() {
    if (trash.length === 0) return;
    const ok = await confirm({
      title: `清空回收站（${trash.length} 个文件）？`,
      description: "全部从 data/image-trash/ 删掉，**不能恢复**。",
      confirmLabel: "清空回收站",
      destructive: true,
    });
    if (!ok) return;
    setTrashBusy(true);
    const result = await purgeTrashAllAction();
    setTrashBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "清空失败");
      return;
    }
    toast.success(result.notice ?? "已清空");
    setTrashSelected([]);
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="space-y-4"
      onPaste={(event) => {
        const list = Array.from(event.clipboardData?.files ?? []);
        if (list.length === 0) return;
        event.preventDefault();
        void addFiles(list);
      }}
    >
      {/* 读数带：张数 / 体积 / 已引用 / 未引用（与状态、体检、阅读统计同一语言） */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="w-band wgl-cells">
          <div className="w-band-cell">
            <span className="band-label">素材</span>
            <span className="band-value">
              <CountUp text={String(stats.total)} />
            </span>
            <span className="band-hint">
              图片 {stats.images}
              {stats.videos > 0 ? ` · 视频 ${stats.videos}` : ""}
            </span>
          </div>
          <div className="w-band-cell">
            <span className="band-label">占用体积</span>
            <span className="band-value">{formatBytes(stats.bytes)}</span>
            <span className="band-hint">大于 1 MB {stats.big} 个</span>
          </div>
          <div className="w-band-cell">
            <span className="band-label">已被引用</span>
            <span className="band-value">
              <CountUp text={String(Math.max(0, stats.total - stats.unused))} />
            </span>
            <span className="band-hint">文章里用到</span>
          </div>
          <div className="w-band-cell">
            <span className="band-label">未被引用</span>
            <span className="band-value">{stats.unused}</span>
            <span className="band-hint">
              {stats.trash > 0 ? `回收站 ${stats.trash}` : "可以清理"}
            </span>
          </div>
        </div>
      </div>

      {/* 上传 */}
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold">上传素材</h2>
          <span className="text-[11px] text-muted-foreground">
            传到服务器 content/images（图片 ≤10MB，视频 ≤60MB）
          </span>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          className={cn(
            "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed px-3 py-2.5 transition-colors",
            dragging ? "border-primary/60 bg-primary/5" : "border-border/70 bg-accent/10",
          )}
        >
          <Button type="button" size="sm" onClick={() => fileInput.current?.click()} disabled={running}>
            <Upload className="size-3.5" />
            上传图片
          </Button>
          <p className="text-[11px] text-muted-foreground">
            拖到这里也行 · <span className="text-foreground">Ctrl+V</span> 粘贴也行
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            文件名前缀
            <Input
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="如 esp32-ota"
              className="h-7 w-[140px] text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={keepName}
              onChange={(event) => setKeepName(event.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            保留原文件名
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoCopy}
              onChange={(event) => setAutoCopy(event.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            上传后自动复制 Markdown
          </label>
          {tasks.some((task) => task.status === "fail") ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void retryFailed()}>
              重试失败项
            </Button>
          ) : null}
        </div>

        {tasks.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {tasks.slice(0, 12).map((task) => (
              <li key={task.id} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground">
                  {task.status === "wait"
                    ? "等待"
                    : task.status === "busy"
                      ? "上传中"
                      : task.status === "done"
                        ? "✅ 完成"
                        : "❌ 失败"}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono">{task.result ?? task.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {task.error ?? formatBytes(task.size)}
                </span>
              </li>
            ))}
            {tasks.length > 12 ? (
              <li className="text-xs text-muted-foreground">…还有 {tasks.length - 12} 条</li>
            ) : null}
            <li className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => setTasks([])}
                disabled={running}
              >
                清空列表
              </Button>
            </li>
          </ul>
        ) : null}
      </section>

      {/* 概览 / 筛选 */}
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索文件名"
              className="h-8 w-[180px] pl-7 text-xs"
            />
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="used">被引用</SelectItem>
              <SelectItem value="unused">未被引用</SelectItem>
              <SelectItem value="big">大于 1 MB</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">最新在前</SelectItem>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="size">按体积</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setQ("");
              setFilter("all");
              setSort("time");
            }}
          >
            重置
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            当前 {rows.length} 个 · {formatBytes(rowsBytes)}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
          >
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
            刷新
          </Button>
        </div>
      </section>

      {/* 图库 */}
      <section className="glass rounded-2xl p-5">
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          {hotlink === "off"
            ? "图片可对外引用：卡片上的「外链」「MD」复制的都是带域名的绝对地址（https://…/content-images/…），站外页面里直接用不会被拦。"
            : `图片绝对地址可以直接访问，但当前防盗链为「${
                hotlink === "relaxed" ? "宽松" : "严格"
              }」：别人在站外网页里引用会被 403 拦掉。要开放外链，去 站点设置 → 外观与安全 → 图片防盗链 改成「关闭」。`}
        </p>
        {rows.length > visibleCount ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              已显示 {shown.length} / {rows.length}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setVisibleCount((count) => count + 24)}
            >
              显示更多
            </Button>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的文件</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 wgl-cells">
            {shown.map((item) => {
              const picked = selected.includes(item.name);
              const url = mediaUrl(item.name);
              return (
                <article
                  key={item.name}
                  className={cn(
                    "glass-soft flex flex-col gap-2 rounded-2xl border border-transparent p-3",
                    picked && "border-primary/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(item.name)}
                    title={picked ? "取消选择" : "选择"}
                    className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted/40"
                  >
                    {item.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={item.alt || item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {item.kind === "video" ? (
                          <Film className="h-7 w-7" />
                        ) : (
                          <FileQuestion className="h-7 w-7" />
                        )}
                      </span>
                    )}
                    {picked ? (
                      <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                        已选
                      </span>
                    ) : null}
                  </button>

                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium" title={item.name}>
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">
                      {formatBytes(item.bytes)} · {formatClock(item.mtime)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1">
                      {item.refs.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          title={item.refs.map((ref) => ref.title).join("、")}
                        >
                          {item.refs.length} 篇引用
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          未被引用
                        </Badge>
                      )}
                      {item.kind === "video" ? (
                        <Badge variant="outline" className="text-[10px]">
                          视频
                        </Badge>
                      ) : null}
                    </p>

                    {altName === item.name ? (
                      <div className="mt-1.5 flex items-center gap-1">
                        <Input
                          value={altDraft}
                          autoFocus
                          onChange={(event) => setAltDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void saveAlt();
                            if (event.key === "Escape") setAltName(null);
                          }}
                          placeholder="alt 文本（一句话描述）"
                          className="h-7 text-[11px]"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void saveAlt()}
                          disabled={altBusy}
                        >
                          保存
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5 text-[11px]"
                          onClick={() => setAltName(null)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center gap-0.5 pt-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="复制外链（站外可用）"
                      aria-label="复制外链"
                      onClick={() => void copyText(`${origin()}${url}`, "已复制外链，可直接站外使用")}
                    >
                      <Link2 className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="复制 Markdown"
                      aria-label="复制 Markdown"
                      onClick={() =>
                        void copyText(
                          `![${item.alt || item.name}](${origin()}${url})`,
                          "已复制 Markdown",
                        )
                      }
                    >
                      <FileCode className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={item.alt ? `alt：${item.alt}` : "写 alt 文本"}
                      aria-label="编辑 alt 文本"
                      onClick={() => openAlt(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title="打开原图"
                      aria-label="打开原图"
                      className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selected.length > 0 ? (
        <div className="glass sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
          <span className="text-sm">
            已选 {selected.length} 个 · {formatBytes(selectedBytes)}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setSelected([])}>
            取消选择
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void onTrash()} disabled={busy}>
            <Trash2 className="size-3.5" />
            {busy ? "处理中…" : "移入回收站"}
          </Button>
        </div>
      ) : null}

      {/* 回收站 */}
      {trash.length > 0 ? (
        <section className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-sm font-semibold">
              回收站 <span className="text-muted-foreground">（{trash.length}）</span>
            </h2>
            <span className="text-[11px] text-muted-foreground">
              文件在服务器 data/image-trash/，还原后回到 content/images
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void onRestore()}
                disabled={trashBusy || trashSelected.length === 0}
              >
                <RotateCcw className="size-3.5" />
                还原选中
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void onPurge()}
                disabled={trashBusy || trashSelected.length === 0}
              >
                <Trash2 className="size-3.5" />
                彻底删除
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => void onPurgeAll()}
                disabled={trashBusy}
              >
                清空
              </Button>
            </div>
          </div>

          <ul className="mt-2 flex flex-wrap gap-1.5">
            {trash.map((item) => {
              const picked = trashSelected.includes(item.name);
              return (
                <li
                  key={item.name}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border border-border/50 px-2 py-1 text-[11px]",
                    picked && "border-primary/50 bg-primary/5",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={picked}
                    onChange={() => toggleTrash(item.name)}
                    className="size-3.5 accent-[var(--primary)]"
                  />
                  <span className="max-w-[200px] truncate font-mono" title={item.name}>
                    {item.original}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatBytes(item.bytes)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {confirmDialog}
    </div>
  );
}
