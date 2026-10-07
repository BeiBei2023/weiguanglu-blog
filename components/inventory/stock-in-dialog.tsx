"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import Papa from "papaparse";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { quickInboundAction, type InboundResult } from "@/app/w/inventory/actions";
import { IdentifyPanel } from "@/components/inventory/identify-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { StockInBoxOption } from "@/lib/inventory/domain";
import { cn } from "cn";

interface Props {
  boxes: StockInBoxOption[];
  defaultBoxId?: number;
  defaultPartNo?: string;
  defaultName?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
  triggerClassName?: string;
}

interface SingleForm {
  partNo: string;
  name: string;
  quantity: string;
  specification: string;
  note: string;
  mpn: string;
  brand: string;
  packageName: string;
  category: string;
  lcscCode: string;
  lcscId: string;
  datasheetUrl: string;
  imageUrl: string;
  packType: string;
  packQty: number;
  unit: string;
  params: { name: string; value: string }[];
}

interface ParsedRow {
  partNo: string;
  name: string;
  quantity: number;
  specification: string;
  note: string;
  error: string;
}

const PLACEHOLDER =
  "10K-0603, 电阻10K 0603, 500, 1%, 常用\n100nF-0603, 电容100nF 0603, 300, 50V X7R, 去耦";

function parseLines(text: string): ParsedRow[] {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: "greedy" });
  return result.data.map((cols) => {
    const partNo = (cols[0] ?? "").trim();
    const name = (cols[1] ?? "").trim();
    const quantityRaw = (cols[2] ?? "").trim();
    const specification = (cols[3] ?? "").trim();
    const note = (cols[4] ?? "").trim();
    const quantity = Number(quantityRaw || 0);
    let error = "";
    if (!partNo) error = "料号不能为空";
    else if (!name) error = "名称不能为空";
    else if (!Number.isInteger(quantity) || quantity < 0) error = "数量必须是大于等于 0 的整数";
    return { partNo, name, quantity, specification, note, error };
  });
}

export function StockInDialog({
  boxes,
  defaultBoxId,
  defaultPartNo = "",
  defaultName = "",
  triggerLabel = "入库",
  triggerVariant = "default",
  triggerSize = "default",
  triggerClassName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("single");
  const [boxId, setBoxId] = useState<string>(
    String(defaultBoxId ?? boxes[0]?.id ?? ""),
  );
  const [slotValue, setSlotValue] = useState("auto");
  const [single, setSingle] = useState<SingleForm>({
    partNo: defaultPartNo,
    name: defaultName,
    quantity: "1",
    specification: "",
    note: "",
    mpn: "",
    brand: "",
    packageName: "",
    category: "",
    lcscCode: "",
    lcscId: "",
    datasheetUrl: "",
    imageUrl: "",
    packType: "",
    packQty: 0,
    unit: "",
    params: [],
  });
  const [batchText, setBatchText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<InboundResult | null>(null);
  const [pending, startTransition] = useTransition();

  const box = boxes.find((item) => String(item.id) === boxId) ?? boxes[0] ?? null;
  const validRows = rows.filter((row) => !row.error);

  const resetFeedback = () => setResult(null);

  const handleBoxChange = (value: string) => {
    setBoxId(value);
    setSlotValue("auto");
    resetFeedback();
  };

  const submitSingle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!box) {
      toast.error("请先创建容器");
      return;
    }
    const partNo = single.partNo.trim();
    const name = single.name.trim();
    if (!partNo || !name) {
      toast.error("料号和名称不能为空");
      return;
    }
    const quantity = Number.parseInt(single.quantity || "0", 10);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error("数量必须是大于等于 0 的整数");
      return;
    }
    startTransition(async () => {
      const res = await quickInboundAction({
        boxId: box.id,
        rows: [
          {
            partNo,
            name,
            quantity,
            specification: single.specification,
            note: single.note,
            mpn: single.mpn,
            brand: single.brand,
            packageName: single.packageName,
            category: single.category,
            lcscCode: single.lcscCode,
            lcscId: single.lcscId,
            datasheetUrl: single.datasheetUrl,
            imageUrl: single.imageUrl,
            packType: single.packType,
            packQty: single.packQty,
            unit: single.unit,
            params: single.params,
            slotIndex: slotValue === "auto" ? undefined : Number(slotValue),
          },
        ],
      });
      setResult(res);
      if (res.ok) {
        const detail = res.details[0];
        toast.success(
          detail?.status === "merged"
            ? `已并入已有位置：${detail.message}`
            : `入库成功：${detail?.message ?? ""}`,
        );
        setSingle((prev) => ({
          ...prev,
          partNo: "",
          name: "",
          quantity: "1",
          specification: "",
          note: "",
          mpn: "",
          brand: "",
          packageName: "",
          category: "",
          lcscCode: "",
          lcscId: "",
          datasheetUrl: "",
          imageUrl: "",
          packType: "",
          packQty: 0,
          unit: "",
          params: [],
        }));
        setSlotValue("auto");
        router.refresh();
      } else {
        toast.error(res.failed[0]?.message ?? res.error ?? "入库失败");
      }
    });
  };

  const handleParse = () => {
    resetFeedback();
    setRows(parseLines(batchText));
  };

  const handleImport = () => {
    if (!box || !validRows.length) return;
    startTransition(async () => {
      const res = await quickInboundAction({
        boxId: box.id,
        rows: validRows.map(({ partNo, name, quantity, specification, note }) => ({
          partNo,
          name,
          quantity,
          specification,
          note,
        })),
      });
      setResult(res);
      if (res.ok) {
        toast.success(`导入完成：新增 ${res.imported}，合并 ${res.merged}`);
        setBatchText("");
        setRows([]);
        router.refresh();
      } else {
        toast.error(res.error ?? "导入失败");
      }
    });
  };

  const boxSelect = (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">容器</Label>
      <Select value={boxId} onValueChange={handleBoxChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="选择容器" />
        </SelectTrigger>
        <SelectContent>
          {boxes.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const resultPanel = result ? (
    <div className="rounded-lg border border-border/70 p-3 text-xs">
      <p className="font-medium">
        结果：新增 {result.imported}，合并 {result.merged}，失败{" "}
        {result.details.filter((item) => item.status === "failed").length}
      </p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {result.details.map((item, index) => (
          <li key={index} className={cn(item.status === "failed" && "text-destructive")}>
            {item.line > 0 ? `第 ${item.line} 行 · ` : ""}
            {item.status === "imported" ? "新增" : item.status === "merged" ? "合并" : "失败"}：
            {item.message}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          <PackagePlus className="size-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>快速入库</DialogTitle>
          <DialogDescription>
            单条直接入库到指定/下一个空位；批量粘贴按顺序填空位。同料号或同参数会自动并入已有启用位置。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="single">单条入库</TabsTrigger>
            <TabsTrigger value="batch">批量粘贴</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-3">
            <form onSubmit={submitSingle} className="space-y-3">
              <IdentifyPanel
                onFill={(fields) => setSingle((current) => ({ ...current, ...fields }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {boxSelect}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">位置</Label>
                  <Select value={slotValue} onValueChange={setSlotValue}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动（下一个空位）</SelectItem>
                      {(box?.emptySlots ?? []).map((slot) => (
                        <SelectItem key={slot.index} value={String(slot.index)}>
                          {slot.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-in-partno" className="text-xs text-muted-foreground">
                    料号 *
                  </Label>
                  <Input
                    id="stock-in-partno"
                    value={single.partNo}
                    onChange={(event) =>
                      setSingle((prev) => ({ ...prev, partNo: event.target.value }))
                    }
                    placeholder="如 10K-0603"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-in-name" className="text-xs text-muted-foreground">
                    名称 *
                  </Label>
                  <Input
                    id="stock-in-name"
                    value={single.name}
                    onChange={(event) =>
                      setSingle((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="如 电阻10K 0603"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-in-qty" className="text-xs text-muted-foreground">
                    数量
                  </Label>
                  <Input
                    id="stock-in-qty"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={single.quantity}
                    onChange={(event) =>
                      setSingle((prev) => ({ ...prev, quantity: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-in-spec" className="text-xs text-muted-foreground">
                    规格
                  </Label>
                  <Input
                    id="stock-in-spec"
                    value={single.specification}
                    onChange={(event) =>
                      setSingle((prev) => ({ ...prev, specification: event.target.value }))
                    }
                    placeholder="如 厚声 / 0603 / 常用"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="stock-in-note" className="text-xs text-muted-foreground">
                    备注
                  </Label>
                  <Input
                    id="stock-in-note"
                    value={single.note}
                    onChange={(event) =>
                      setSingle((prev) => ({ ...prev, note: event.target.value }))
                    }
                    placeholder="如 LCSC item 9243"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={pending || !box}>
                  {pending ? "入库中…" : "入库"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  入库后可继续录入下一条（表单自动清空）
                </span>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="batch" className="mt-3 space-y-3">
            {boxSelect}
            <Textarea
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              rows={6}
              placeholder={PLACEHOLDER}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleParse} disabled={!batchText.trim()}>
                解析预览
              </Button>
              <Button onClick={handleImport} disabled={!validRows.length || pending || !box}>
                {pending ? "导入中…" : `确认导入（${validRows.length} 行）`}
              </Button>
              {rows.length ? (
                <span className="text-xs text-muted-foreground">
                  共 {rows.length} 行，异常 {rows.length - validRows.length} 行
                </span>
              ) : null}
            </div>
            {rows.length ? (
              <div className="max-h-56 overflow-auto rounded-lg border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">行</TableHead>
                      <TableHead>料号</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead className="w-16">数量</TableHead>
                      <TableHead>规格</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>提示</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, index) => (
                      <TableRow key={index} className={cn(row.error && "text-destructive")}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{row.partNo}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{row.specification}</TableCell>
                        <TableCell>{row.note}</TableCell>
                        <TableCell className="text-xs">{row.error || "正常"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        {resultPanel}
      </DialogContent>
    </Dialog>
  );
}
