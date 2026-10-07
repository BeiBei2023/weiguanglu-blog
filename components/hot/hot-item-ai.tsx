"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import type { AiItemNote } from "@/lib/ai-item";

/**
 * 单条热点的 AI 详细解说（手动触发）。
 * 生成过一次就存到服务器，下次打开直接看到，想更新点「重新生成」。
 */
export function HotItemAi({
  id,
  title,
  url,
  meta,
  summary,
  initialNote,
}: {
  id: string;
  title: string;
  url: string;
  meta?: string;
  summary?: string;
  initialNote: AiItemNote | null;
}) {
  const [note, setNote] = useState<AiItemNote | null>(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/w/ai/item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, title, url, meta, summary }),
      });
      const data = (await response.json()) as { ok?: boolean; note?: AiItemNote; error?: string };
      if (!response.ok || !data.ok || !data.note) throw new Error(data.error ?? `HTTP ${response.status}`);
      setNote(data.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败，稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Sparkles className="size-4 text-primary" />
          AI 详细解说
        </h2>
        <span className="text-xs text-muted-foreground">只在你点按钮时调用</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => void run()} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : note ? (
              <RefreshCw className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {busy ? "正在写…" : note ? "重新生成" : "让 AI 详细说说"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {note ? (
        <article className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/90">
          {note.text
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          <p className="pt-1 text-xs text-muted-foreground">
            由 {note.model || "AI"} 生成于 {formatClock(note.at)} · 可能有误，关键信息请对照原文
          </p>
        </article>
      ) : !error ? (
        <p className="mt-3 text-sm text-muted-foreground">
          还没有解说 —— 点右上「让 AI 详细说说」，它会根据标题、来源数据和原文摘要写一段中文解读。
        </p>
      ) : null}
    </section>
  );
}
