"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type ComponentType, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import { FilePlus2, FileText, Info, PenLine, Upload } from "lucide-react";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import type { Visibility } from "@/lib/content/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_IMAGE_UPLOAD,
  formatBytes,
  formatSpeed,
  uploadWithProgress,
  type UploadProgressInfo,
} from "@/lib/upload";

interface MDEditorProps {
  value: string;
  onChange: (value?: string) => void;
  height?: number;
  preview?: "live" | "edit" | "preview";
}

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
}) as unknown as ComponentType<MDEditorProps>;

export interface EditorInitial {
  title: string;
  date: string;
  tags: string;
  description: string;
  visibility: Visibility;
  /** 系列 / 专栏名（可空） */
  series: string;
  /** 系列内序号（可空，字符串形式便于输入框） */
  seriesOrder: string;
  content: string;
}

interface Props {
  mode: "create" | "edit";
  slug?: string;
  version?: string;
  initial: EditorInitial;
}

const VIS_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "公开" },
  { value: "login", label: "登录可见" },
  { value: "draft", label: "草稿" },
];

export function PostEditor({ mode, slug: initialSlug, version, initial }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [slug, setSlug] = useState(initialSlug ?? "");
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [tags, setTags] = useState(initial.tags);
  const [description, setDescription] = useState(initial.description);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [series, setSeries] = useState(initial.series);
  const [seriesOrder, setSeriesOrder] = useState(initial.seriesOrder);
  const [content, setContent] = useState(initial.content);
  const [currentVersion, setCurrentVersion] = useState(version ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<
    ({ index: number; count: number } & UploadProgressInfo) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function insertMarkdown(text: string) {
    const textarea = wrapperRef.current?.querySelector("textarea");
    if (!textarea) {
      setContent((current) => `${current}\n${text}`);
      return;
    }
    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? start;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + text.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  async function uploadFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading(true);
    setError(null);
    for (let i = 0; i < images.length; i += 1) {
      const file = images[i];
      if (file.size > MAX_IMAGE_UPLOAD) {
        setError(`${file.name} 超过 10MB，已跳过`);
        continue;
      }
      setUploadProgress({
        index: i + 1,
        count: images.length,
        loaded: 0,
        total: file.size,
        percent: 0,
        speed: 0,
        eta: 0,
        sent: false,
      });
      try {
        const { path } = await uploadWithProgress(file, (info) =>
          setUploadProgress({ index: i + 1, count: images.length, ...info }),
        ).promise;
        insertMarkdown(`![](${path})`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "图片上传失败");
      }
    }
    setUploadProgress(null);
    setUploading(false);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      void uploadFiles(files);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      void uploadFiles(files);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
      event.preventDefault();
    }
  }

  async function save(force = false) {
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    if (mode === "create" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      setError("slug 只能是小写英文、数字与连字符");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      slug: slug.trim(),
      title,
      date,
      tags,
      description,
      visibility,
      series,
      seriesOrder,
      content,
      version: currentVersion,
      force,
    };
    const url = mode === "create" ? "/api/admin/posts" : `/api/admin/posts/${slug}`;

    try {
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 409 && !force) {
        const data = (await response.json().catch(() => ({}))) as { version?: string };
        if (data.version) setCurrentVersion(data.version);
        const overwrite = await confirm({
          title: "远端文件已被改动",
          description: "可能你在本地编辑过。确认用当前内容覆盖远端文件吗？",
          confirmLabel: "覆盖",
        });
        if (overwrite) {
          await save(true);
        }
        return;
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string; version?: string };
      if (!response.ok) {
        setError(data.error ?? "保存失败");
        return;
      }

      if (data.version) setCurrentVersion(data.version);
      setMessage("已保存");
      router.refresh();
      if (mode === "create") {
        router.push(`/admin/edit/${slug.trim()}`);
      }
    } catch {
      setError("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (mode !== "edit") return;
    const ok = await confirm({
      title: `删除《${title}》？`,
      description: "文章文件会从磁盘删除，不可撤销。",
      confirmLabel: "删除",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/posts/${slug}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "删除失败");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("网络错误，删除失败");
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    title !== initial.title ||
    date !== initial.date ||
    tags !== initial.tags ||
    description !== initial.description ||
    visibility !== initial.visibility ||
    series !== initial.series ||
    seriesOrder !== initial.seriesOrder ||
    content !== initial.content ||
    slug !== (initialSlug ?? "");

  // 有未保存改动时，刷新/关闭标签页给出浏览器确认
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function cancel() {
    if (dirty) {
      const ok = await confirm({
        title: "放弃未保存的改动？",
        description: "离开后本次修改不会保存。",
        confirmLabel: "放弃并离开",
      });
      if (!ok) return;
    }
    router.push("/admin");
  }

  return (
    <div className="space-y-5">
      {confirmDialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => void cancel()}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <span aria-hidden>←</span> 返回列表
          </button>
          <h1 className="mt-1 flex items-center gap-2 font-heading text-[24px] font-semibold tracking-[-0.3px]">
            {mode === "create" ? (
              <FilePlus2 className="h-5 w-5 text-primary" />
            ) : (
              <PenLine className="h-5 w-5 text-primary" />
            )}
            {mode === "create" ? "新建文章" : "编辑文章"}
          </h1>
          {mode === "edit" ? (
            <p className="mt-0.5 text-[12.5px] tabular-nums text-muted-foreground">/{slug}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/posts/${slug}`}>查看</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={remove}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                删除
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* 元信息 */}
      <section className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-sm font-semibold">元信息</h2>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">标题、slug、日期、可见性与摘要</p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="post-title">标题</Label>
            <Input
              id="post-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-slug">
              slug（英文，文件名即 URL{initialSlug ? "，不可改" : ""}）
            </Label>
            <Input
              id="post-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={mode === "edit"}
              placeholder="my-new-post"
              autoComplete="off"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-date">日期</Label>
            <Input
              id="post-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-visibility">可见性</Label>
            <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
              <SelectTrigger id="post-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="post-tags">标签（英文逗号分隔）</Label>
            <Input
              id="post-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="docker, 运维"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="post-description">摘要（列表页 / SEO）</Label>
            <Textarea
              id="post-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-series">系列 / 专栏（可空）</Label>
            <Input
              id="post-series"
              value={series}
              onChange={(event) => setSeries(event.target.value)}
              placeholder="例如：ESP32 入门"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-series-order">系列内序号（可空）</Label>
            <Input
              id="post-series-order"
              type="number"
              value={seriesOrder}
              onChange={(event) => setSeriesOrder(event.target.value)}
              placeholder="1"
            />
          </div>
        </div>
      </section>

      {/* 正文 */}
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-sm font-semibold">正文</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Markdown · 可直接粘贴或拖拽图片上传
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading
              ? uploadProgress?.sent
                ? "处理中…"
                : `上传中 ${uploadProgress?.percent ?? 0}%`
              : "上传图片"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void uploadFiles(files);
              event.target.value = "";
            }}
          />
        </div>
        {uploading && uploadProgress ? (
          <div className="mt-3 space-y-1.5">
            <Progress value={uploadProgress.percent} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                第 {uploadProgress.index}/{uploadProgress.count} 张
              </span>
              <span className="tabular-nums">{uploadProgress.percent}%</span>
              <span>
                {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
              </span>
              {uploadProgress.speed > 0 ? (
                <span className="tabular-nums">{formatSpeed(uploadProgress.speed)}</span>
              ) : null}
              {uploadProgress.sent ? (
                <span>上传完成，服务端处理中…</span>
              ) : uploadProgress.eta > 0 ? (
                <span>剩余约 {Math.ceil(uploadProgress.eta)} 秒</span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div
          ref={wrapperRef}
          data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
          suppressHydrationWarning
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="mt-3"
        >
          <MDEditor value={content} onChange={(value) => setContent(value ?? "")} height={480} />
        </div>
      </section>

      {/* 吸底操作条 */}
      <div className="glass sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        {message ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            {message}
          </Badge>
        ) : saving ? (
          <span className="text-xs text-muted-foreground">保存中…</span>
        ) : dirty ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            有未保存的改动
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            已同步
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void cancel()} disabled={saving}>
            取消
          </Button>
          <Button type="button" size="sm" onClick={() => save()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
