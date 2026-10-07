import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayAssetUrl } from "@/lib/inventory/asset-url";
import type { Component } from "@/lib/inventory/types";
import { StockAdjustForm } from "./stock-adjust-form";

/**
 * 元件信息卡（只读）：点格子先看这个，需要改再点「编辑」进二级入口。
 * 盒位、数量、参数、数据手册、参考图都在这里。
 */
export function ComponentCard({
  component,
  position,
  editHref,
}: {
  component: Component;
  position: string;
  editHref: string;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "型号", value: component.mpn },
    { label: "品牌", value: component.brand },
    { label: "封装", value: component.packageName },
    { label: "分类", value: component.category },
    { label: "立创编号", value: component.lcscCode },
    { label: "商品 ID", value: component.lcscId },
    { label: "包装形式", value: component.packType },
    { label: "打包数量", value: component.packQty ? String(component.packQty) : "" },
    { label: "单位", value: component.unit },
    { label: "低库存阈值", value: component.minStock ? String(component.minStock) : "" },
  ].filter((row) => row.value);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">
            {component.name || component.partNo || "未命名元件"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {component.partNo}
            {component.mpn && component.mpn !== component.partNo ? ` · ${component.mpn}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{position}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">当前数量</p>
            <p className="font-heading text-2xl font-bold">
              {component.quantity}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {component.unit || "个"}
              </span>
            </p>
          </div>
          <StockAdjustForm componentId={component.id} max={component.quantity} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[160px_1fr] wgl-cells">
        {component.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- 本地化的参考图，不走 next/image 优化 */
          <img
            src={displayAssetUrl(component.imageUrl, "image")}
            alt={component.name || component.partNo || "元件参考图"}
            className="h-32 w-32 rounded-xl border border-border bg-white object-contain p-1"
          />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
            无参考图
          </div>
        )}

        {rows.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 self-start text-sm sm:grid-cols-3 wgl-cells">
            {rows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="truncate" title={row.value}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {component.params.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">参数（{component.params.length}）</h3>
          <dl className="grid gap-x-6 text-sm sm:grid-cols-2 wgl-cells">
            {component.params.map((param) => (
              <div
                key={`${param.name}-${param.value}`}
                className="flex justify-between gap-3 border-b border-border/50 py-1"
              >
                <dt className="shrink-0 text-muted-foreground">{param.name}</dt>
                <dd className="text-right">{param.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {component.specification ? (
        <p className="text-sm text-muted-foreground">规格摘要：{component.specification}</p>
      ) : null}

      {component.note ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">备注：{component.note}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <Link href={editHref}>
            <Pencil className="size-4" />
            编辑
          </Link>
        </Button>
        {component.datasheetUrl ? (
          <Button asChild variant="outline" size="sm">
            <a
              href={displayAssetUrl(component.datasheetUrl, "datasheet")}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-4" />
              数据手册
            </a>
          </Button>
        ) : null}
        {component.lcscId ? (
          <Button asChild variant="outline" size="sm">
            <a href={`https://item.szlcsc.com/${component.lcscId}.html`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              立创商城
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
