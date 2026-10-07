"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatClock } from "@/lib/format";
import type { HotData, HotItem, HotSource } from "@/lib/hot";

/** 每列默认只显示前几条，点「展开全部」再看剩下的 */
const PREVIEW = 12;

/** 每个源一个颜色点，扫起来更容易分辨 */
const DOT: Record<string, string> = {
  juejin: "bg-sky-500",
  ithome: "bg-rose-500",
  sspai: "bg-emerald-500",
  github: "bg-zinc-700 dark:bg-zinc-200",
};

export function HotPanel({ initial }: { initial: HotData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function refresh() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/w/hot", { method: "POST" });
        const payload = (await response.json()) as HotData & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "刷新失败");
        setData(payload);
        toast.success("已刷新");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "刷新失败");
      }
    });
  }

  const total = data.sources.reduce((sum, source) => sum + source.items.length, 0);
  const keyword = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!keyword) return [];
    return data.sources.flatMap((source) =>
      source.items
        .filter((item) => `${item.title} ${item.meta ?? ""}`.toLowerCase().includes(keyword))
        .map((item) => ({ source, item })),
    );
  }, [data, keyword]);

  const activeSource = data.sources.find((source) => source.id === active) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="在全部热点里搜标题 / 关键词…"
            className="h-9 pl-9 pr-8"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清空"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={refresh}>
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          {pending ? "刷新中…" : "立即刷新"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <SourceChip
          active={active === "all" && !keyword}
          label="全部"
          count={total}
          onClick={() => {
            setActive("all");
            setQuery("");
          }}
        />
        {data.sources.map((source) => (
          <SourceChip
            key={source.id}
            active={active === source.id && !keyword}
            label={source.name}
            count={source.items.length}
            dot={DOT[source.id]}
            onClick={() => {
              setActive(source.id);
              setQuery("");
            }}
          />
        ))}
        <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">
          更新于 {formatClock(data.fetchedAt)} · 共 {total} 条
        </span>
      </div>

      {keyword ? (
        <section className="glass rounded-2xl p-5">
          <h2 className="font-heading text-base font-bold tabular-nums">搜索结果 · {matches.length} 条</h2>
          {matches.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">没有匹配「{query.trim()}」的内容</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {matches.map(({ source, item }) => (
                <li key={`${source.id}-${item.id}`}>
                  <ItemRow item={item} sourceName={source.name} dot={DOT[source.id]} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : activeSource ? (
        <section className="glass rounded-2xl p-5">
          <SourceHead source={activeSource} />
          {activeSource.error ? <ErrorNote error={activeSource.error} /> : null}
          {activeSource.items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 wgl-cells">
              {activeSource.items.map((item, index) => (
                <li key={`${activeSource.id}-${item.id}`}>
                  <ItemRow item={item} index={index + 1} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4 wgl-cells">
          {data.sources.map((source) => {
            const isOpen = Boolean(expanded[source.id]);
            const visible = isOpen ? source.items : source.items.slice(0, PREVIEW);
            return (
              <section key={source.id} className="glass rounded-2xl p-5">
                <SourceHead source={source} />
                {source.error ? <ErrorNote error={source.error} /> : null}
                {source.items.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">暂无内容</p>
                ) : (
                  <>
                    <ol className="mt-3 space-y-2.5">
                      {visible.map((item, index) => (
                        <li key={`${source.id}-${item.id}`}>
                          <ItemRow item={item} index={index + 1} />
                        </li>
                      ))}
                    </ol>
                    {source.items.length > PREVIEW ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((current) => ({ ...current, [source.id]: !isOpen }))
                        }
                        className="mt-3 w-full rounded-xl border border-border/70 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {isOpen ? "收起" : `展开全部 ${source.items.length} 条`}
                      </button>
                    ) : null}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceChip({
  active,
  label,
  count,
  dot,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", dot)} /> : null}
      {label}
      <span className="text-[10px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function SourceHead({ source }: { source: HotSource }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
        {DOT[source.id] ? <span className={cn("size-2 rounded-full", DOT[source.id])} /> : null}
        {source.name}
      </h2>
      {source.home ? (
        <a
          href={source.home}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-primary hover:underline"
        >
          原站
        </a>
      ) : null}
    </div>
  );
}

function ErrorNote({ error }: { error: string }) {
  return (
    <p className="mt-2 text-xs text-amber-600">这次没抓到（{error}），先显示上次的结果。</p>
  );
}

function ItemRow({
  item,
  index,
  sourceName,
  dot,
}: {
  item: HotItem;
  index?: number;
  sourceName?: string;
  dot?: string;
}) {
  return (
    <div className="flex gap-2">
      {typeof index === "number" ? (
        <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {index}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <Link
          href={`/w/hot/item/${item.id}`}
          className="block text-sm leading-snug transition-colors hover:text-primary"
        >
          {item.title}
        </Link>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {sourceName ? (
            <>
              {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", dot)} /> : null}
              <span className="shrink-0">{sourceName}</span>
            </>
          ) : null}
          {item.meta ? <span className="truncate">{item.meta}</span> : null}
        </span>
      </span>
    </div>
  );
}
