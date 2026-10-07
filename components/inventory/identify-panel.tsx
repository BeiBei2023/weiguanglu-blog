"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";
import { displayAssetUrl } from "@/lib/inventory/asset-url";
import type { LookupItem, LookupResult } from "@/lib/inventory/lookup";

export type IdentifyFillFields = LookupItem["form"];

/**
 * 「立创识别」面板：输入型号 / 立创编号 / 商品链接（或扫码结果），
 * 自动抓取基础信息并回填入库表单。
 */
export function IdentifyPanel({ onFill }: { onFill: (fields: IdentifyFillFields) => void }) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<LookupItem[]>([]);
  const [active, setActive] = useState<LookupItem | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function request(query: string): Promise<LookupResult> {
    const response = await fetch(`/api/w/inventory/lookup?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | (LookupResult & { error?: string })
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || `识别失败（HTTP ${response.status}）`);
    }
    if (!payload) throw new Error("识别失败：返回内容为空");
    return payload;
  }

  function fill(item: LookupItem) {
    setActive(item);
    onFill({ ...item.form });
    toast.success(`已填入：${item.model || item.lcscCode || item.name}`);
    if (item.name || item.brand) {
      setHint([item.name, item.brand, item.packageName].filter(Boolean).join(" · "));
    } else {
      setHint(null);
    }
  }

  function run(input: string) {
    const value = input.trim();
    if (!value) return;
    startTransition(async () => {
      try {
        const result = await request(value);
        setHint(null);
        const items = result.items ?? [];
        const notes: string[] = [];
        if (result.cached) notes.push("来自缓存");
        if (result.matchedKeyword && result.matchedKeyword !== value) {
          notes.push(`已按「${result.matchedKeyword}」放宽匹配到 ${items.length} 条`);
        }
        setFallback(notes.length ? notes.join(" · ") : null);
        if (!items.length) {
          setCandidates([]);
          setActive(null);
          toast.error("没有找到匹配的元器件");
          return;
        }
        if (items.length === 1) {
          setCandidates([]);
          fill(items[0]);
          return;
        }
        // 型号搜索到多个：先列候选，默认选中第一个
        setCandidates(items);
        fill(items[0]);
      } catch (error) {
        setCandidates([]);
        setActive(null);
        toast.error(error instanceof Error ? error.message : "识别失败");
      }
    });
  }

  async function pick(item: LookupItem) {
    // 候选是搜索简版：用编号再查一次，补全价格/库存/参数/数据手册
    if (item.lcscCode) {
      run(item.lcscCode);
      return;
    }
    fill(item);
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="identify-query" className="text-xs text-muted-foreground">
          立创识别（型号 / 立创编号 / 商品链接 / 扫码结果）
        </Label>
        <span className="text-[11px] text-muted-foreground">数据源：立创EDA · 立创商城</span>
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          id="identify-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              run(query);
            }
          }}
          placeholder="如 ESP32-C3-MINI-1 / C42411897 / item.szlcsc.com/44398166.html"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !query.trim()}
          onClick={() => run(query)}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ScanSearch className="size-4" />
          )}
          识别
        </Button>
      </div>

      {fallback && <p className="mt-1.5 text-[11px] text-muted-foreground">{fallback}</p>}

      {candidates.length > 1 && (
        <div className="mt-3 max-h-56 space-y-1.5 overflow-auto pr-1">
          {candidates.map((item, index) => {
            const selected =
              active?.lcscCode === item.lcscCode && active?.model === item.model && index === 0;
            return (
              <button
                key={`${item.lcscCode}-${item.model}-${index}`}
                type="button"
                onClick={() => pick(item)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-2.5 py-2 text-left text-sm transition-colors hover:border-primary/50",
                  selected && "border-primary/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.model || item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[item.brand, item.packageName, item.lcscCode].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.stock !== null ? `库存 ${item.stock}` : "填入 →"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <div className="mt-3 rounded-xl border border-border/70 bg-background/60 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{active.model || active.lcscCode}</span>
            {active.lcscCode && (
              <span className="text-xs text-muted-foreground tabular-nums">{active.lcscCode}</span>
            )}
            {active.stock !== null && (
              <span className="text-xs text-muted-foreground">库存 {active.stock}</span>
            )}
            {/* 价格不参与入库，不再展示 */}
          </div>
          {(active.name || hint) && (
            <p className="mt-1 text-xs text-muted-foreground">{active.name || hint}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              active.brand,
              active.packageName,
              active.category,
              active.minPack ? `最小包装 ${active.minPack}` : "",
              active.arrange ? `编排 ${active.arrange}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {active.fields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {active.fields.slice(0, 12).map((field) => (
                <span
                  key={`${field.name}-${field.value}`}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {field.name}：{field.value}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {active.datasheetUrl && (
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href={displayAssetUrl(active.datasheetUrl, "datasheet")}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" />
                数据手册
              </a>
            )}
            {active.productId && (
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href={`https://item.szlcsc.com/${active.productId}.html`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" />
                立创商城
              </a>
            )}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => fill(active)}
            >
              重新填入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
