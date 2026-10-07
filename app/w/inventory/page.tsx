import { PartsView, type PartRow, type ViewFilter } from "@/components/inventory/parts-view";
import {
  SEARCH_MIN_DISPLAY_SCORE,
  buildStockInBoxes,
  parseSearchFuzziness,
  slotCodeForBox,
  type SearchFuzziness,
} from "@/lib/inventory/domain";
import { searchInventory } from "@/lib/inventory/search";
import { readInventory } from "@/lib/inventory/store";
import type { Component } from "@/lib/inventory/types";

export const metadata = { title: "元器件仓库" };
export const dynamic = "force-dynamic";

type Search = Promise<{
  q?: string;
  fuzziness?: string;
  minScore?: string;
  view?: string;
}>;

export default async function InventoryPage({ searchParams }: { searchParams: Search }) {
  const { q = "", fuzziness: fuzzinessRaw, minScore: minScoreRaw, view } = await searchParams;
  const fuzziness: SearchFuzziness = parseSearchFuzziness(fuzzinessRaw);
  const parsedMin = Number.parseFloat(minScoreRaw ?? "");
  const minScore = Number.isFinite(parsedMin)
    ? Math.max(0, Math.min(parsedMin, 50))
    : SEARCH_MIN_DISPLAY_SCORE;
  const initialView: ViewFilter = view === "low" || view === "disabled" ? view : "all";

  const data = await readInventory();
  const threshold = data.settings.lowStockThreshold;
  const boxById = new Map(data.boxes.map((box) => [box.id, box]));

  const toRow = (component: Component): PartRow => {
    const box = boxById.get(component.boxId);
    return {
      id: component.id,
      partNo: component.partNo,
      name: component.name,
      specification: component.specification,
      mpn: component.mpn,
      brand: component.brand,
      packageName: component.packageName,
      category: component.category,
      lcscCode: component.lcscCode,
      datasheetUrl: component.datasheetUrl,
      imageUrl: component.imageUrl,
      unit: component.unit,
      packQty: component.packQty,
      params: component.params,
      quantity: component.quantity,
      minStock: component.minStock || threshold,
      boxName: box?.name ?? `盒子#${component.boxId}`,
      slotCode: box ? slotCodeForBox(box, component.slotIndex) : String(component.slotIndex),
      boxId: component.boxId,
      slotIndex: component.slotIndex,
      enabled: component.enabled,
      lowStock: component.quantity < (component.minStock || threshold),
    };
  };

  let rows: PartRow[];
  if (q.trim()) {
    const { rows: hits } = searchInventory(data, q, fuzziness, minScore);
    rows = hits.map((hit) => ({
      ...toRow(hit.component),
      matchSummary: hit.matchSummary,
      matchedTerms: hit.matchedTerms,
      matchScore: hit.matchScore,
    }));
  } else {
    rows = data.components
      .map(toRow)
      .sort((a, b) => a.partNo.localeCompare(b.partNo));
  }

  const counts = {
    all: data.components.length,
    low: data.components.filter(
      (component) => component.enabled && component.quantity < threshold,
    ).length,
    disabled: data.components.filter((component) => !component.enabled).length,
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <h1 className="font-heading text-xl font-bold">库存</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用顶部搜索找元件（任意仓库页面都能搜）；行内填数量点 − 出库 / + 入库
        </p>
      </div>
      <PartsView
        rows={rows}
        q={q}
        threshold={threshold}
        initialView={initialView}
        stockInBoxes={buildStockInBoxes(data)}
        counts={counts}
      />
    </div>
  );
}
