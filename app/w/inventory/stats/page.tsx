import { cn } from "cn";
import { AlertCircle, Boxes, Cpu, Layers } from "lucide-react";
import { ExportCsvButton } from "@/components/inventory/export-csv-button";
import { TrendChart, TypeChart } from "@/components/inventory/stats-charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildTrendPoints,
  buildTypeStats,
  enabledQuantity,
  recentEventRows,
  slotCodeForBox,
} from "@/lib/inventory/domain";
import { readInventory } from "@/lib/inventory/store";

export const metadata = { title: "元器件仓库 · 统计" };
export const dynamic = "force-dynamic";

export default async function InventoryStatsPage() {
  const data = await readInventory();
  const threshold = data.settings.lowStockThreshold;
  const enabled = data.components.filter((component) => component.enabled);
  const lowStockCount = enabled.filter((component) => component.quantity < threshold).length;
  const totalQuantity = enabledQuantity(data);
  const typeStats = buildTypeStats(data);
  const trend7 = buildTrendPoints(data, 7);
  const trend30 = buildTrendPoints(data, 30);
  const events = recentEventRows(data, 20);

  const boxById = new Map(data.boxes.map((box) => [box.id, box]));
  const exportRows = data.components.map((component) => {
    const box = boxById.get(component.boxId);
    return {
      料号: component.partNo,
      名称: component.name,
      规格: component.specification,
      数量: component.quantity,
      容器: box?.name ?? `盒子#${component.boxId}`,
      位置: box ? slotCodeForBox(box, component.slotIndex) : String(component.slotIndex),
      状态: component.enabled ? "启用" : "停用",
      备注: component.note,
    };
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-bold">统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            库存趋势、类型分布与最近变动（按库存流水统计）
          </p>
        </div>
        <ExportCsvButton rows={exportRows} filename="inventory-full" label="导出全库 CSV" />
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 wgl-cells">
        <MetricCard title="容器总数" value={String(data.boxes.length)} icon={Boxes} />
        <MetricCard title="启用元件" value={String(enabled.length)} icon={Cpu} />
        <MetricCard title="总库存数量" value={String(totalQuantity)} icon={Layers} />
        <MetricCard title="待补货元件" value={String(lowStockCount)} icon={AlertCircle} danger={lowStockCount > 0} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2 wgl-cells">
        <TrendChart trend7={trend7} trend30={trend30} />
        <TypeChart stats={typeStats} />
      </div>

      <section className="glass rounded-2xl p-5">
        <h2 className="font-heading text-base font-semibold">类型明细</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>容器</TableHead>
                <TableHead>启用元件</TableHead>
                <TableHead>库存数量</TableHead>
                <TableHead>低库存</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typeStats.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="text-sm">{item.label}</TableCell>
                  <TableCell className="text-sm tabular-nums">{item.boxCount}</TableCell>
                  <TableCell className="text-sm tabular-nums">{item.itemCount}</TableCell>
                  <TableCell className="text-sm tabular-nums">{item.quantity}</TableCell>
                  <TableCell
                    className={cn(
                      "text-sm tabular-nums",
                      item.lowStockCount > 0 && "text-destructive",
                    )}
                  >
                    {item.lowStockCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <h2 className="font-heading text-base font-semibold">最近变动</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>料号</TableHead>
                <TableHead>变动</TableHead>
                <TableHead>位置</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length ? (
                events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.atLabel}
                    </TableCell>
                    <TableCell className="text-xs">{event.typeLabel}</TableCell>
                    <TableCell className="font-mono text-xs">{event.partNo || "-"}</TableCell>
                    <TableCell
                      className={cn(
                        "text-sm tabular-nums",
                        event.delta > 0 ? "text-emerald-500" : event.delta < 0 && "text-destructive",
                      )}
                    >
                      {event.delta > 0 ? `+${event.delta}` : event.delta}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.boxName ? `${event.boxName} / ${event.slotCode}` : "-"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    暂无库存变动记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  danger = false,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  return (
    <article className="glass rounded-2xl p-4 transition-all hover:border-primary/40">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{title}</p>
        <Icon className={cn("h-4 w-4", danger ? "text-destructive" : "text-primary/70")} />
      </div>
      <p className={cn("mt-1.5 font-heading text-2xl font-bold", danger && "text-destructive")}>
        {value}
      </p>
    </article>
  );
}
