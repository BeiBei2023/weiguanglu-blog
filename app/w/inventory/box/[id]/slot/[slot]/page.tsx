import Link from "next/link";
import { notFound } from "next/navigation";
import { ComponentCard } from "@/components/inventory/component-card";
import { ComponentForm } from "@/components/inventory/component-form";
import { StockAdjustForm } from "@/components/inventory/stock-adjust-form";
import { Button } from "@/components/ui/button";
import { findBox, findComponentAt, slotCodeForBox } from "@/lib/inventory/domain";
import { readInventory } from "@/lib/inventory/store";

export const metadata = { title: "元器件仓库 · 元件信息" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; slot: string }>;
type Search = Promise<{ q?: string; notice?: string; error?: string; edit?: string }>;

export default async function SlotPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id, slot } = await params;
  const { q = "", notice, error, edit } = await searchParams;
  const boxId = Number(id);
  const slotIndex = Number(slot);
  if (!Number.isInteger(boxId) || boxId <= 0) notFound();
  if (!Number.isInteger(slotIndex) || slotIndex <= 0) notFound();

  const data = await readInventory();
  const box = findBox(data, boxId);
  if (!box) notFound();
  if (slotIndex > box.slotCapacity) notFound();

  const component = findComponentAt(data, box.id, slotIndex);
  const slotCode = slotCodeForBox(box, slotIndex);
  const editing = edit === "1";
  const backQuery = q ? `?q=${encodeURIComponent(q)}` : "";
  const editQuery = `?edit=1${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-bold">
            {box.name} - 编号 {slotCode}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing
              ? "步骤: 填写核心字段 -> 检查数量 -> 保存"
              : component
                ? "元件信息（只读）；要改动点下面的「编辑」"
                : "这个格位还是空的"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/w/inventory/box/${box.id}`}>返回宫格</Link>
          </Button>
          {editing ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/w/inventory/box/${box.id}/slot/${slotIndex}${backQuery}`}>
                返回信息卡
              </Link>
            </Button>
          ) : null}
          {q ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/w/inventory/search?q=${encodeURIComponent(q)}`}>返回快速搜索</Link>
            </Button>
          ) : null}
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

      <section className="glass rounded-2xl p-5">
        {editing ? (
          <>
            {component ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  当前数量 <strong className="text-foreground">{component.quantity}</strong>
                </span>
                <StockAdjustForm componentId={component.id} max={component.quantity} />
                <span className="text-xs text-muted-foreground">
                  填数量后点 − 出库 / + 入库（立即生效）
                </span>
              </div>
            ) : null}
            <ComponentForm
              boxId={box.id}
              slot={slotIndex}
              slotCode={slotCode}
              component={component}
              q={q}
              lockStorageMode={data.settings.lockStorageMode}
            />
          </>
        ) : component ? (
          <ComponentCard
            component={component}
            position={`${box.name} · 编号 ${slotCode}`}
            editHref={`/w/inventory/box/${box.id}/slot/${slotIndex}${editQuery}`}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">这个格位还没有元件</p>
            <Button asChild size="sm">
              <Link href={`/w/inventory/box/${box.id}/slot/${slotIndex}${editQuery}`}>
                放入元件
              </Link>
            </Button>
          </div>
        )}
      </section>

      {editing ? (
        <p className="text-xs text-muted-foreground">
          规格建议写 2-4 个关键参数并用 / 分隔（品牌 / 封装 / 用途）；备注可写来源编号，如 LCSC item 9243。
        </p>
      ) : null}
    </div>
  );
}
