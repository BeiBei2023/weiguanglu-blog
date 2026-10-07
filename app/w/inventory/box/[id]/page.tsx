import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Package } from "lucide-react";
import { BagCapacityForm } from "@/components/inventory/bag-capacity-form";
import { ExportCsvButton } from "@/components/inventory/export-csv-button";
import { SlotGrid } from "@/components/inventory/slot-grid";
import { StockInDialog } from "@/components/inventory/stock-in-dialog";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_BOX_TYPES,
  buildStockInBoxes,
  findBox,
  slotCodeForBox,
  slotDataForBox,
  slotRangeLabel,
} from "@/lib/inventory/domain";
import { readInventory } from "@/lib/inventory/store";
import { labelRowsFor } from "@/lib/inventory/csv";

export const metadata = { title: "元器件仓库 · 容器" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ notice?: string; error?: string; highlight?: string; q?: string }>;

export default async function BoxPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const { notice, error, highlight, q } = await searchParams;
  const boxId = Number(id);
  if (!Number.isInteger(boxId) || boxId <= 0) notFound();

  const data = await readInventory();
  const box = findBox(data, boxId);
  if (!box) notFound();

  const meta = DEFAULT_BOX_TYPES[box.boxType];
  const slots = slotDataForBox(data, box);
  const emptySlots = slots.filter((slot) => !slot.component).length;
  const stockInBoxes = buildStockInBoxes(data);
  const keyword = (q ?? "").trim();
  const carried = keyword ? `?q=${encodeURIComponent(keyword)}` : "";
  const parsedHighlight = Number.parseInt(highlight ?? "", 10);
  const highlightSlot =
    Number.isInteger(parsedHighlight) && parsedHighlight > 0 && parsedHighlight <= box.slotCapacity
      ? parsedHighlight
      : undefined;
  const exportRows = slots.map((slot) => ({
    位置: slot.slotCode,
    料号: slot.component?.partNo ?? "",
    名称: slot.component?.name ?? "",
    规格: slot.component?.specification ?? "",
    数量: slot.component?.quantity ?? "",
    状态: slot.component ? (slot.component.enabled ? "启用" : "停用") : "空位",
    备注: slot.component?.note ?? "",
  }));

  const usedCount = box.slotCapacity - emptySlots;
  const usagePct = Math.round((usedCount / box.slotCapacity) * 100);

  // 标签版：只导出本盒的元件（贴纸/便签打印，一行一格）
  const labelRows = labelRowsFor(
    data.components.filter((component) => component.boxId === box.id),
    [box],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
            <Package className="h-5 w-5 text-primary" />
            {box.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.label} · 容量 {box.slotCapacity} 位 · 范围 {slotRangeLabel(box)} · 空位{" "}
            {emptySlots}
          </p>
          <div className="mt-2 flex max-w-xs items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">已用 {usedCount}/{box.slotCapacity}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
              <div className="h-full rounded-full bg-primary" style={{ width: `${usagePct}%` }} />
            </div>
            <span className="tabular-nums">{usagePct}%</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsvButton
            rows={exportRows}
            filename={`box-${box.id}`}
            label="导出清单 CSV"
          />
          <ExportCsvButton
            rows={labelRows}
            filename={`box-${box.id}-labels`}
            label="导出标签"
          />
          <Button asChild variant="outline" size="sm">
            <Link href={`/w/inventory/boxes${carried}`}>返回容器</Link>
          </Button>
          <StockInDialog
            boxes={stockInBoxes}
            defaultBoxId={box.id}
            triggerLabel="入库"
            triggerSize="sm"
          />
        </div>
      </header>

      {highlightSlot ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span>
            已定位到 <strong className="text-foreground">{slotCodeForBox(box, highlightSlot)}</strong>
            ，下面高亮的就是它 —— 点格子进入编辑
          </span>
          <Link
            href={`/w/inventory/box/${box.id}${carried}`}
            className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
          >
            取消定位
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm">
          {notice}
        </p>
      ) : null}

      <section className="glass rounded-2xl p-5">
        {box.boxType === "bag" ? (
          <div className="mb-4">
            <BagCapacityForm boxId={box.id} slotCapacity={box.slotCapacity} />
          </div>
        ) : null}
        <SlotGrid
          boxId={box.id}
          boxType={box.boxType}
          slots={slots}
          lowStockThreshold={data.settings.lowStockThreshold}
          highlightSlot={highlightSlot}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        点格位进入编辑；低库存（&lt;{data.settings.lowStockThreshold}）标红；右上角可导出本盒清单 CSV
      </p>
    </div>
  );
}
