import Link from "next/link";
import { Boxes } from "lucide-react";
import { cn } from "cn";
import { BoxCard } from "@/components/inventory/box-card";
import { NewBoxDialog } from "@/components/inventory/new-box-dialog";
import { buildBoxGroups, DEFAULT_BOX_TYPES } from "@/lib/inventory/domain";
import { readInventory } from "@/lib/inventory/store";
import { ExportCsvButton } from "@/components/inventory/export-csv-button";
import { labelRowsFor } from "@/lib/inventory/csv";
import { BOX_TYPES, type BoxType } from "@/lib/inventory/types";

export const metadata = { title: "元器件仓库 · 容器" };
export const dynamic = "force-dynamic";

type Search = Promise<{ type?: string; notice?: string; error?: string }>;

export default async function BoxesPage({ searchParams }: { searchParams: Search }) {
  const { type, notice, error } = await searchParams;
  const currentType: BoxType | null = BOX_TYPES.includes(type as BoxType)
    ? (type as BoxType)
    : null;

  const data = await readInventory();
  const groups = buildBoxGroups(data);
  const items = currentType
    ? groups[currentType]
    : BOX_TYPES.flatMap((key) => groups[key]);

  // 标签版：全部元件（按 盒 → 格 排序），一次打完所有贴纸
  const labelRows = labelRowsFor(data.components, data.boxes);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">容器</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            格位网格按实物排列；格数、前缀、起始号都能改
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsvButton
            rows={labelRows}
            filename="inventory-labels-all"
            label="导出全部标签"
          />
          <NewBoxDialog />
        </div>
      </header>

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

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/w/inventory/boxes"
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            !currentType
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
          )}
        >
          全部 {data.boxes.length}
        </Link>
        {BOX_TYPES.map((key) => (
          <Link
            key={key}
            href={`/w/inventory/boxes?type=${key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              currentType === key
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            {DEFAULT_BOX_TYPES[key].label} {groups[key].length}
          </Link>
        ))}
      </div>

      {items.length ? (
        <div className="grid gap-3 xl:grid-cols-2 wgl-cells">
          {items.map((item) => (
            <BoxCard key={item.box.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="glass flex min-h-[30vh] flex-col items-center justify-center rounded-2xl p-8 text-center">
          <Boxes className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            {currentType ? "这个类型下还没有容器。" : "还没有容器，点右上角「新增容器」开始。"}
          </p>
        </div>
      )}
    </div>
  );
}
