"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BarChart3, Boxes, Package, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SEARCH_FUZZY_PROFILES,
  parseSearchFuzziness,
  type SearchFuzziness,
  type StockInBoxOption,
} from "@/lib/inventory/domain";
import { StockInDialog } from "./stock-in-dialog";
import { BatchIdentifyDialog } from "./batch-identify-dialog";
import { MaintenanceDialog } from "./maintenance-dialog";

const ITEMS = [
  { href: "/w/inventory", label: "库存", icon: Package, exact: true },
  { href: "/w/inventory/boxes", label: "容器", icon: Boxes, exact: false },
  { href: "/w/inventory/stats", label: "统计", icon: BarChart3, exact: false },
];

const DEFAULT_FUZZY = parseSearchFuzziness(undefined);

/**
 * 全仓库通用搜索框：回车/点搜索跳到库存结果页 /w/inventory?q=…
 * 放在顶部工具条里，所以库存/容器/统计/盒位任意页面都能直接搜。
 * 用 key 按 URL 参数重挂载（而不是在 effect 里 setState）来同步外部导航。
 */
function SearchBox({
  initialQ,
  initialFuzzy,
  initialMin,
}: {
  initialQ: string;
  initialFuzzy: SearchFuzziness;
  initialMin: string;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialQ);
  const [fuzzy, setFuzzy] = useState<SearchFuzziness>(initialFuzzy);
  const [minScore, setMinScore] = useState(initialMin);

  const advanced = fuzzy !== DEFAULT_FUZZY || Number.parseFloat(minScore) > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = keyword.trim();
    if (!value) {
      router.push("/w/inventory");
      return;
    }
    const next = new URLSearchParams();
    next.set("q", value);
    next.set("fuzziness", fuzzy);
    const parsed = Number.parseFloat(minScore);
    if (Number.isFinite(parsed)) next.set("minScore", String(parsed));
    router.push(`/w/inventory?${next.toString()}`);
  }

  function clear() {
    setKeyword("");
    if (initialQ.trim()) router.push("/w/inventory");
  }

  return (
    <form
      onSubmit={submit}
      className="order-last flex w-full items-center gap-1.5 sm:order-none sm:w-auto sm:min-w-[180px] sm:max-w-[420px] sm:flex-1"
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜料号 / 名称 / 规格…"
          aria-label="搜索元件"
          autoComplete="off"
          enterKeyHint="search"
          className="h-8 w-full rounded-xl border border-border bg-background/40 pl-8 pr-7 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        {keyword ? (
          <button
            type="button"
            aria-label="清空搜索"
            onClick={clear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="搜索选项"
            title="匹配宽松度 / 最低分"
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary",
              advanced && "border-primary/50 text-primary",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">匹配宽松度</p>
            <Select value={fuzzy} onValueChange={(value) => setFuzzy(value as SearchFuzziness)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEARCH_FUZZY_PROFILES) as SearchFuzziness[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SEARCH_FUZZY_PROFILES[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">最低展示分</p>
            <Input
              value={minScore}
              onChange={(event) => setMinScore(event.target.value)}
              type="number"
              step="0.1"
              min={0}
              placeholder="默认"
              className="h-8 text-xs"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            匹配越宽松命中的越多、分数越低；点「搜索」或回车生效。
          </p>
        </PopoverContent>
      </Popover>

      <Button type="submit" size="sm" className="shrink-0">
        搜索
      </Button>
    </form>
  );
}

/** 顶部工具条：导航 + 全仓库通用搜索 + 入库 */
export function InventoryNav({ boxes }: { boxes: StockInBoxOption[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const qParam = params.get("q") ?? "";
  const fuzzyParam = parseSearchFuzziness(params.get("fuzziness") ?? undefined);
  const minParam = params.get("minScore") ?? "";

  // 切页时把搜索词带上，任何仓库页面都能接着搜
  function withQuery(href: string): string {
    if (!qParam.trim()) return href;
    const next = new URLSearchParams();
    next.set("q", qParam);
    next.set("fuzziness", fuzzyParam);
    if (minParam) next.set("minScore", minParam);
    return `${href}?${next.toString()}`;
  }

  return (
    <nav className="glass sticky-bar sticky top-20 z-30 flex flex-wrap items-center gap-1.5 rounded-2xl p-1.5">
      <div className="flex shrink-0 items-center gap-1">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={withQuery(item.href)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <SearchBox
        key={`${qParam}|${fuzzyParam}|${minParam}`}
        initialQ={qParam}
        initialFuzzy={fuzzyParam}
        initialMin={minParam}
      />

      <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
        <MaintenanceDialog />
        <BatchIdentifyDialog boxes={boxes} />
        <StockInDialog boxes={boxes} triggerLabel="入库" triggerSize="sm" />
      </div>
    </nav>
  );
}
