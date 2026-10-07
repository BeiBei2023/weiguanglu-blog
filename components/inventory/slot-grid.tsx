"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { displayAssetUrl } from "@/lib/inventory/asset-url";
import { Button } from "@/components/ui/button";
import { DEFAULT_BOX_TYPES, orderSlotsForLayout, type SlotItem } from "@/lib/inventory/domain";
import type { BoxType } from "@/lib/inventory/types";

interface Props {
  boxId: number;
  boxType: BoxType;
  slots: SlotItem[];
  lowStockThreshold: number;
  /** 从搜索结果定位过来时高亮的格位序号 */
  highlightSlot?: number;
}

const DENSITY_KEY = "inventory-slot-density";

let compactSnapshot = false;
let snapshotReady = false;
const densityListeners = new Set<() => void>();

function subscribeDensity(listener: () => void) {
  densityListeners.add(listener);
  return () => {
    densityListeners.delete(listener);
  };
}

function getDensitySnapshot(): boolean {
  if (!snapshotReady) {
    snapshotReady = true;
    try {
      compactSnapshot = window.localStorage.getItem(DENSITY_KEY) === "compact";
    } catch {
      compactSnapshot = false;
    }
  }
  return compactSnapshot;
}

function getDensityServerSnapshot(): boolean {
  return false;
}

function setDensity(next: boolean) {
  compactSnapshot = next;
  snapshotReady = true;
  try {
    window.localStorage.setItem(DENSITY_KEY, next ? "compact" : "detailed");
  } catch {
    // 忽略写入失败
  }
  for (const listener of densityListeners) listener();
}

const GRID_CLASS: Record<BoxType, string> = {
  // 按实物排列：小盒 4 列、中盒 3 列（自定义/袋装自适应）
  small_28: "grid-cols-4",
  medium_30: "grid-cols-3",
  custom: "grid-cols-4 sm:grid-cols-5 md:grid-cols-6",
  bag: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
};

export function SlotGrid({ boxId, boxType, slots, lowStockThreshold, highlightSlot }: Props) {
  // 热力基准：本盒里最多的那一格（线性刻度 → 满格最暖，一眼看出重点库存）
  const maxQty = Math.max(1, ...slots.map((slot) => slot.component?.quantity ?? 0));
  const compact = useSyncExternalStore(
    subscribeDensity,
    getDensitySnapshot,
    getDensityServerSnapshot,
  );
  const meta = DEFAULT_BOX_TYPES[boxType];
  const orderedSlots = orderSlotsForLayout(
    slots,
    meta.layoutCols,
    meta.layoutOrder,
    slots.length,
  );
  const highlightRef = useRef<HTMLAnchorElement | null>(null);

  // 从搜索定位过来时，把那一格滚到视野中间
  useEffect(() => {
    if (!highlightSlot) return;
    highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightSlot]);

  const toggle = () => setDensity(!compact);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">低库存阈值 {lowStockThreshold}</p>
        <Button variant="outline" size="sm" onClick={toggle} aria-pressed={compact}>
          {compact ? "切换到详细模式" : "切换到精简模式"}
        </Button>
      </div>

      <div className={cn("mt-3 grid gap-1.5", GRID_CLASS[boxType])}>
        {orderedSlots.map((item) => {
          const component = item.component;
          const lowStock = component ? component.quantity < lowStockThreshold : false;
          const highlighted = highlightSlot === item.slot;
          // 图左字右：图片用固定方形尺寸，文字区自适应
          const imageSize =
            boxType === "bag" ? (compact ? "size-16" : "size-24") : compact ? "size-8" : "size-12";
          return (
            <Link
              key={item.slot}
              ref={highlighted ? highlightRef : undefined}
              href={`/w/inventory/box/${boxId}/slot/${item.slot}`}
              title={highlighted ? "已定位：点开编辑这一格" : undefined}
              className={cn(
                "group flex gap-2 rounded-xl border p-2 text-xs transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-sm",
                boxType === "bag" ? "min-h-[92px]" : "min-h-[84px]",
                component
                  ? "border-border bg-background/70"
                  : "border-dashed border-border/50 bg-background/25 text-muted-foreground/70",
                component && !component.enabled && "opacity-60",
                lowStock && "border-destructive/60",
                highlighted && "wgl-slot-target",
              )}
              // 数量热力：对数刻度给底色（元件数量常跨几个数量级），货越多越暖
              style={
                component
                  ? {
                      backgroundColor: `color-mix(in oklab, var(--primary) ${Math.min(
                        48,
                        Math.round((component.quantity / maxQty) * 48),
                      )}%, color-mix(in oklab, var(--background) 70%, transparent))`,
                    }
                  : undefined
              }
            >
              {component?.imageUrl ? (
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center self-start overflow-hidden rounded-lg border border-border/60 bg-white",
                    imageSize,
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 本地化的参考图，不走 next/image 优化 */}
                  <img
                    src={displayAssetUrl(component.imageUrl, "image")}
                    alt={component.name || component.partNo}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </span>
              ) : null}

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-start justify-between gap-1">
                  <span className="font-mono font-medium">{item.slotCode}</span>
                  {lowStock ? (
                    <span className="shrink-0 text-[10px] text-destructive">低库存</span>
                  ) : null}
                </span>

                {component ? (
                  <>
                    <small
                      className="mt-1 truncate font-mono text-[11px] group-hover:text-foreground"
                      title={component.partNo}
                    >
                      {component.partNo}
                    </small>
                    <small
                      className="truncate text-[11px] text-muted-foreground group-hover:text-foreground/80"
                      title={component.name}
                    >
                      {component.name}
                    </small>
                    {!compact ? (
                      <span className="mt-1 block space-y-0.5 text-[10px] text-muted-foreground">
                        {item.specFields.package ? (
                          <small className="block truncate">封装: {item.specFields.package}</small>
                        ) : null}
                        {item.specFields.usage ? (
                          <small className="block truncate">用途: {item.specFields.usage}</small>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="mt-auto flex items-center justify-between gap-1 pt-1 text-[11px]">
                      <span>数量: {component.quantity}</span>
                      {!component.enabled ? (
                        <span className="text-[10px] text-muted-foreground">已停用</span>
                      ) : null}
                    </span>
                    {!compact && item.lcscCode ? (
                      <button
                        type="button"
                        className="mt-0.5 truncate text-left text-[10px] text-primary hover:underline"
                        title="点击复制立创编号"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void navigator.clipboard
                            .writeText(item.lcscCode)
                            .then(() => toast.success(`已复制 ${item.lcscCode}`));
                        }}
                      >
                        编号: {item.lcscCode}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <small className="mt-1 text-muted-foreground">空位</small>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
