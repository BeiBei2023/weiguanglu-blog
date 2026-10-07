"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, MapPin, Search, X } from "lucide-react";
import { cn } from "cn";
import { ExportCsvButton } from "@/components/inventory/export-csv-button";
import { StockAdjustForm } from "@/components/inventory/stock-adjust-form";
import { StockInDialog } from "@/components/inventory/stock-in-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayAssetUrl } from "@/lib/inventory/asset-url";
import type { StockInBoxOption } from "@/lib/inventory/domain";

export interface PartRow {
  id: number;
  partNo: string;
  name: string;
  specification: string;
  mpn: string;
  brand: string;
  packageName: string;
  category: string;
  lcscCode: string;
  datasheetUrl: string;
  imageUrl: string;
  unit: string;
  packQty: number;
  params: { name: string; value: string }[];
  quantity: number;
  /** 该元件自己的最低库存（为 0 时用全局阈值） */
  minStock: number;
  boxName: string;
  slotCode: string;
  boxId: number;
  slotIndex: number;
  enabled: boolean;
  lowStock: boolean;
  matchSummary?: string;
  matchedTerms?: string[];
  matchScore?: number;
}

const DEFAULT_PAGE_SIZE = "24";

export type ViewFilter = "all" | "low" | "disabled";

const VIEW_LABELS: Record<ViewFilter, string> = {
  all: "全部",
  low: "低库存",
  disabled: "已停用",
};

interface Props {
  rows: PartRow[];
  q: string;
  threshold: number;
  initialView: ViewFilter;
  stockInBoxes: StockInBoxOption[];
  counts: { all: number; low: number; disabled: number };
}

export function PartsView({
  rows,
  q,
  threshold,
  initialView,
  stockInBoxes,
  counts,
}: Props) {
  const [view, setView] = useState<ViewFilter>(initialView);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>(
    q ? [] : [{ id: "partNo", desc: false }],
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: Number(DEFAULT_PAGE_SIZE),
  });
  const [sizeChoice, setSizeChoice] = useState(DEFAULT_PAGE_SIZE);

  const searching = Boolean(q.trim());

  /** 定位到宫格的链接：带上当前搜索词，方便回去（宫格页搜索框不清空） */
  function locateHref(row: PartRow): string {
    const params = new URLSearchParams({ highlight: String(row.slotIndex) });
    if (searching) params.set("q", q.trim());
    return `/w/inventory/box/${row.boxId}?${params.toString()}`;
  }

  const data = useMemo(
    () =>
      rows.filter((row) => {
        if (view === "low") return row.enabled && row.lowStock;
        if (view === "disabled") return !row.enabled;
        return true;
      }),
    [rows, view],
  );

  // 数量微条基准：当前列表里最多的那一种（线性刻度 → 相对高低一眼可见）
  const maxQty = Math.max(1, ...data.map((row) => row.quantity));
  const columns = useMemo<ColumnDef<PartRow>[]>(
    () => [
      {
        accessorKey: "partNo",
        header: "料号",
        cell: ({ row }) => (
          <span
            className="block max-w-[150px] truncate font-mono text-xs"
            title={row.original.partNo}
          >
            {row.original.partNo}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "名称",
        cell: ({ row }) => (
          <div className="flex min-w-0 max-w-[230px] items-start gap-2">
            {row.original.imageUrl ? (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- 本地化的参考图，不走 next/image 优化 */}
                <img
                  src={displayAssetUrl(row.original.imageUrl, "image")}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <Link
                href={locateHref(row.original)}
                title="到宫格里定位这一格"
                className="block truncate text-sm transition-colors hover:text-primary"
              >
                {row.original.name}
              </Link>
              {row.original.matchSummary ? (
                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {row.original.matchSummary}
                    {row.original.matchScore !== undefined
                      ? ` · ${row.original.matchScore.toFixed(1)}`
                      : ""}
                  </span>
                  {(row.original.matchedTerms ?? []).slice(0, 3).map((term) => (
                    <Badge key={term} variant="outline" className="text-[10px]">
                      {term}
                    </Badge>
                  ))}
                </span>
              ) : null}
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {row.original.params.length ? (
                  <span
                    className="text-[10px] text-muted-foreground"
                    title={row.original.params
                      .map((param) => `${param.name}=${param.value}`)
                      .join("；")}
                  >
                    参数 {row.original.params.length} 项
                  </span>
                ) : null}
                {row.original.datasheetUrl ? (
                  <a
                    href={displayAssetUrl(row.original.datasheetUrl, "datasheet")}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    数据手册
                  </a>
                ) : null}
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "brand",
        header: "品牌",
        cell: ({ row }) => (
          <span
            className="block max-w-[110px] truncate text-xs text-muted-foreground"
            title={row.original.brand}
          >
            {row.original.brand || "-"}
          </span>
        ),
      },
      {
        accessorKey: "packageName",
        header: "封装",
        cell: ({ row }) => (
          <span
            className="block max-w-[110px] truncate font-mono text-xs text-muted-foreground"
            title={row.original.packageName}
          >
            {row.original.packageName || "-"}
          </span>
        ),
      },
      {
        accessorKey: "specification",
        header: "规格",
        cell: ({ row }) => (
          <span
            className="block max-w-[140px] truncate text-xs text-muted-foreground"
            title={row.original.specification}
          >
            {row.original.specification || "-"}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        header: "库存",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className={cn("text-sm tabular-nums", row.original.lowStock && "text-destructive")}>
              {row.original.quantity}
            </span>
            {/* 数量微条：线性刻度（相对当前列表最大值），低库存用红 */}
            <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-border/50" aria-hidden>
              <span
                className={cn("block h-full rounded-full", row.original.lowStock ? "bg-destructive" : "bg-primary")}
                style={{
                  width: `${Math.max(6, Math.min(100, Math.round((row.original.quantity / maxQty) * 100)))}%`,
                }}
              />
            </span>
          </span>
        ),
      },
      {
        id: "location",
        accessorFn: (row) => `${row.boxName} ${row.slotCode}`,
        header: "位置",
        cell: ({ row }) => (
          <Link
            href={locateHref(row.original)}
            title={`到宫格里定位：${row.original.boxName} / ${row.original.slotCode}`}
            className="inline-flex max-w-[130px] items-center gap-1 truncate rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
          >
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">
              {row.original.boxName} / {row.original.slotCode}
            </span>
          </Link>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => (row.enabled ? (row.lowStock ? "低库存" : "正常") : "已停用"),
        header: "状态",
        cell: ({ row }) =>
          !row.original.enabled ? (
            <Badge variant="outline">已停用</Badge>
          ) : row.original.lowStock ? (
            <Badge variant="destructive">低库存</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              正常
            </Badge>
          ),
      },
      {
        id: "actions",
        header: "操作",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button asChild variant="outline" size="sm">
              <Link href={locateHref(row.original)}>
                <MapPin />
                定位
              </Link>
            </Button>
            {row.original.enabled ? (
              <StockAdjustForm componentId={row.original.id} max={row.original.quantity} />
            ) : null}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locateHref 依赖 q，q 变化时列需重建
    [q],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table 官方已知限制
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  const visibleRows = table.getFilteredRowModel().rows;
  // 清单版：按「位置 → 元件 → 数量」排，方便按货架顺序核对、也方便表格里手工补数据
  const exportRows = useMemo(
    () =>
      visibleRows.map((row) => ({
        位置: `${row.original.boxName} / ${row.original.slotCode}`,
        容器: row.original.boxName,
        格号: row.original.slotCode,
        名称: row.original.name,
        规格: row.original.specification,
        封装: row.original.packageName,
        料号: row.original.partNo,
        型号: row.original.mpn,
        品牌: row.original.brand,
        分类: row.original.category,
        数量: row.original.quantity,
        单位: row.original.unit,
        打包数量: row.original.packQty,
        最低库存: row.original.minStock,
        状态: !row.original.enabled ? "停用" : row.original.lowStock ? "低库存" : "正常",
        参数: row.original.params.map((param) => `${param.name}=${param.value}`).join("；"),
        立创编号: row.original.lcscCode,
        数据手册: row.original.datasheetUrl,
        备注: "",
      })),
    [visibleRows],
  );

  const pageRows = table.getRowModel().rows;
  const pageCount = Math.max(table.getPageCount(), 1);
  const totalVisible = exportRows.length;
  const rangeStart = totalVisible === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const rangeEnd = Math.min(rangeStart + pageRows.length - 1, totalVisible);

  /** 「全部」用一个足够大的页长表示；单独记一个选择项，否则选择框回显不准 */
  function changeSize(value: string) {
    setSizeChoice(value);
    table.setPageSize(value === "all" ? Math.max(totalVisible, 1) : Number(value));
    table.setPageIndex(0);
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-2xl p-5">
        {searching ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <Search className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              搜索「<span className="font-medium text-foreground">{q}</span>」 ·{" "}
              <span className="tabular-nums">{rows.length}</span> 条匹配
            </span>
            <Link
              href="/w/inventory"
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
            >
              <X className="size-3" />
              清除
            </Link>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="在本页结果里再筛选…"
            aria-label="筛选结果"
            className="w-56"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(VIEW_LABELS) as ViewFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs tabular-nums transition-colors",
                  view === key
                    ? "border-primary/60 bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {VIEW_LABELS[key]} {counts[key]}
              </button>
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            共 {counts.all} 种 · 当前显示 {exportRows.length} 条 · 低库存阈值 {threshold}
          </span>
          <ExportCsvButton
            rows={exportRows}
            filename="inventory"
            label="导出清单"
            className="ml-auto"
          />
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : sortable ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-medium"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center">
                    {searching ? (
                      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                        <div>
                          <p>没找到「{q}」</p>
                          <p className="mt-1 text-xs">
                            试试减少关键词或换宽松度，或直接把它入库
                          </p>
                        </div>
                        <StockInDialog
                          boxes={stockInBoxes}
                          defaultPartNo={q}
                          defaultName={q}
                          triggerLabel="入库这个料号"
                          triggerVariant="outline"
                          triggerSize="sm"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        没有符合条件的元件
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-background/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground tabular-nums">
              {totalVisible === 0
                ? "没有匹配的记录"
                : `第 ${rangeStart}-${rangeEnd} 条 · 本页 ${pageRows.length} 条`}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Select value={sizeChoice} onValueChange={changeSize}>
                <SelectTrigger className="h-7 w-[92px] text-xs" aria-label="每页显示条数">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 条 / 页</SelectItem>
                  <SelectItem value="50">50 条 / 页</SelectItem>
                  <SelectItem value="100">100 条 / 页</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft className="size-3.5" />
                上一页
              </Button>
              <span className="px-1 tabular-nums text-muted-foreground">
                {pagination.pageIndex + 1} / {pageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                下一页
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
