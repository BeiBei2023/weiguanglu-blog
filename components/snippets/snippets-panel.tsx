"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteSnippetAction, saveSnippetAction } from "@/app/w/snippets/actions";
import type { Snippet } from "@/lib/snippets";
import { formatBytes, formatClock } from "@/lib/format";



export function SnippetsPanel({
  initial,
  stats,
}: {
  initial: Snippet[];
  stats: { total: number; tags: number; bytes: number };
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const snippet of initial) {
      for (const name of snippet.tags) map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [initial]);

  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    return initial.filter((snippet) => {
      if (tag && !snippet.tags.includes(tag)) return false;
      if (!key) return true;
      return (
        snippet.title.toLowerCase().includes(key) ||
        snippet.content.toLowerCase().includes(key) ||
        snippet.tags.some((name) => name.toLowerCase().includes(key))
      );
    });
  }, [initial, q, tag]);

  const startCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (editing) data.set("id", editing.id);
    setBusy(true);
    const result = await saveSnippetAction(data);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "保存失败");
      return;
    }
    toast.success(result.notice ?? "已保存");
    form.reset();
    setEditing(null);
    setOpen(false);
    router.refresh();
  };

  const onDelete = async (snippet: Snippet) => {
    const ok = await confirm({
      title: `删除「${snippet.title}」？`,
      description: "删除后无法恢复。",
      confirmLabel: "删除",
    });
    if (!ok) return;
    setBusy(true);
    const result = await deleteSnippetAction(snippet.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "删除失败");
      return;
    }
    toast.success(result.notice ?? "已删除");
    router.refresh();
  };

  const copy = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      toast.success("已复制");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  return (
    <>
      <div className="glass overflow-hidden rounded-2xl">
        <div className="w-band wgl-cells">
          <div className="w-band-cell">
            <span className="band-label">片段</span>
            <span className="band-value">{stats.total}</span>
            <span className="band-hint">条已收藏</span>
          </div>
          <div className="w-band-cell">
            <span className="band-label">标签</span>
            <span className="band-value">{stats.tags}</span>
            <span className="band-hint">个分类</span>
          </div>
          <div className="w-band-cell">
            <span className="band-label">体积</span>
            <span className="band-value">{formatBytes(stats.bytes)}</span>
            <span className="band-hint">data/snippets.json</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜索标题 / 内容 / 标签"
            className="h-8 w-[220px] pl-7 text-xs"
          />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={startCreate}>
          <Plus className="size-3.5" />
          新建
        </Button>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setTag(null)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              tag === null ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            全部
          </button>
          {allTags.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setTag(name === tag ? null : name)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                name === tag ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {name} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {open ? (
        <form ref={formRef} onSubmit={onSubmit} className="glass space-y-3 rounded-3xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-sm font-semibold">
              {editing ? `编辑「${editing.title}」` : "新建片段"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              <X className="size-3.5" />
              取消
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div>
              <Label htmlFor="snip-title" className="text-xs text-muted-foreground">
                标题
              </Label>
              <Input
                id="snip-title"
                name="title"
                defaultValue={editing?.title ?? ""}
                placeholder="例如：ESP-IDF 烧录命令"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="snip-lang" className="text-xs text-muted-foreground">
                语言
              </Label>
              <Input
                id="snip-lang"
                name="language"
                defaultValue={editing?.language ?? "bash"}
                placeholder="bash"
                className="mt-1 h-8 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="snip-tags" className="text-xs text-muted-foreground">
              标签（逗号分隔）
            </Label>
            <Input
              id="snip-tags"
              name="tags"
              defaultValue={editing?.tags.join(", ") ?? ""}
              placeholder="esp32, 命令"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="snip-content" className="text-xs text-muted-foreground">
              内容
            </Label>
            <textarea
              id="snip-content"
              name="content"
              defaultValue={editing?.content ?? ""}
              rows={8}
              spellCheck={false}
              className="mt-1 w-full rounded-xl border border-border/70 bg-transparent p-3 font-mono text-xs outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </Button>
            <span className="text-xs text-muted-foreground">
              存在服务器 data/snippets.json，随备份一起走
            </span>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="glass rounded-3xl p-6 text-sm text-muted-foreground">
          {initial.length === 0 ? "还没有片段，点「新建」记一条常用命令。" : "没有匹配的片段。"}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((snippet) => (
            <li key={snippet.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-sm font-semibold">{snippet.title}</p>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {snippet.language}
                </Badge>
                {snippet.tags.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setTag(name)}
                    className="rounded-full bg-accent/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    #{name}
                  </button>
                ))}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {formatClock(snippet.updatedAt)}
                </span>
              </div>
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-black/25 p-3 font-mono text-xs leading-relaxed">
                {snippet.content}
              </pre>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void copy(snippet)}>
                  <Copy className="size-3.5" />
                  复制
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(snippet);
                    setOpen(true);
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void onDelete(snippet)}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmDialog}
    </>
  );
}
