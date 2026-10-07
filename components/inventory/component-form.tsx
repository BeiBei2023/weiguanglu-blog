"use client";

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { z } from "zod";
import {
  deleteComponentAction,
  saveComponentAction,
  toggleComponentAction,
} from "@/app/w/inventory/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { displayAssetUrl } from "@/lib/inventory/asset-url";
import type { Component } from "@/lib/inventory/types";

/** 备注里由识别自动写入的「机器段」（已结构化到独立字段，不在备注框里展示） */
const MACHINE_PREFIX = /^(立创编号|立创ID|ID|编排|最小包装|参数|数据手册)[\s:：]/;

function humanNote(note: string): string {
  return note
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !MACHINE_PREFIX.test(segment))
    .join(" | ");
}

function paramsToText(params: Component["params"] | undefined): string {
  return (params ?? []).map((param) => `${param.name}=${param.value}`).join("\n");
}

const formSchema = z.object({
  partNo: z.string().trim().min(1, "料号和名称不能为空").max(200),
  name: z.string().trim().min(1, "料号和名称不能为空").max(200),
  specification: z.string().trim().max(500),
  mpn: z.string().trim().max(200),
  brand: z.string().trim().max(160),
  packageName: z.string().trim().max(160),
  category: z.string().trim().max(160),
  lcscCode: z.string().trim().max(40),
  lcscId: z.string().trim().max(40),
  datasheetUrl: z.string().trim().max(600),
  imageUrl: z.string().trim().max(600),
  packType: z.string().trim().max(40),
  unit: z.string().trim().max(16),
  packQty: z.string().trim().regex(/^\d*$/, "打包数量必须是整数"),
  minStock: z.string().trim().regex(/^\d*$/, "低库存阈值必须是整数"),
  quantity: z.string().trim().regex(/^\d+$/, "数量必须是大于等于 0 的整数"),
  paramsText: z.string().max(4000),
  note: z.string().trim().max(1000),
});
type FormValues = z.infer<typeof formSchema>;
type FieldErrors = Partial<Record<keyof FormValues, string>>;

interface Props {
  boxId: number;
  slot: number;
  slotCode: string;
  component: Component | null;
  q: string;
  lockStorageMode: boolean;
}

export function ComponentForm({
  boxId,
  slot,
  slotCode,
  component,
  q,
  lockStorageMode,
}: Props) {
  const [values, setValues] = useState<FormValues>(() => ({
    partNo: component?.partNo ?? "",
    name: component?.name ?? "",
    specification: component?.specification ?? "",
    mpn: component?.mpn ?? "",
    brand: component?.brand ?? "",
    packageName: component?.packageName ?? "",
    category: component?.category ?? "",
    lcscCode: component?.lcscCode ?? "",
    lcscId: component?.lcscId ?? "",
    datasheetUrl: component?.datasheetUrl ?? "",
    imageUrl: component?.imageUrl ?? "",
    packType: component?.packType ?? "",
    unit: component?.unit ?? "",
    packQty: component?.packQty ? String(component.packQty) : "",
    minStock: component?.minStock ? String(component.minStock) : "",
    quantity: String(component?.quantity ?? 0),
    paramsText: paramsToText(component?.params),
    note: humanNote(component?.note ?? ""),
  }));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [confirmPositionChange, setConfirmPositionChange] = useState(false);
  const [deleteConfirmSlot, setDeleteConfirmSlot] = useState("");
  const [saving, startSave] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();
  const { confirm, confirmDialog } = useConfirm();

  const needsAdvanced = Boolean(
    error && (error.includes("合并") || error.includes("替换")),
  );
  const hasLcscInfo = Boolean(
    values.lcscCode ||
      values.lcscId ||
      values.packType ||
      values.datasheetUrl ||
      values.imageUrl ||
      values.paramsText.trim(),
  );

  const bind = (key: keyof FormValues) => ({
    value: values[key],
    onChange: (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setValues((prev) => ({ ...prev, [key]: event.target.value })),
  });

  const baseFormData = () => {
    const formData = new FormData();
    formData.set("boxId", String(boxId));
    formData.set("slot", String(slot));
    formData.set("q", q);
    return formData;
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setError(null);
    const formData = baseFormData();
    for (const [key, value] of Object.entries(parsed.data)) {
      formData.set(key, value);
    }
    formData.set("confirmMerge", confirmMerge ? "1" : "");
    formData.set("confirmPositionChange", confirmPositionChange ? "1" : "");
    startSave(async () => {
      const result = await saveComponentAction(null, formData);
      if (result && !result.ok) setError(result.error ?? "保存失败");
    });
  };

  const handleToggle = () => {
    setError(null);
    const formData = baseFormData();
    formData.set("enable", component?.enabled ? "0" : "1");
    startToggle(async () => {
      const result = await toggleComponentAction(null, formData);
      if (result && !result.ok) setError(result.error ?? "操作失败");
    });
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await confirm({
      title: "删除这个元件记录？",
      description: `位置 ${slotCode} 的料号记录会被移除，不可撤销。`,
      confirmLabel: "删除",
    });
    if (!ok) return;
    setError(null);
    const formData = baseFormData();
    formData.set("deleteConfirmSlot", deleteConfirmSlot);
    startDelete(async () => {
      const result = await deleteComponentAction(null, formData);
      if (result && !result.ok) setError(result.error ?? "删除失败");
    });
  };

  return (
    <div className="space-y-4">
      {confirmDialog}
      {lockStorageMode ? (
        <Alert>
          <AlertDescription>
            当前为锁仓模式: 禁止删除位置绑定，禁止替换当前位置料号。
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="partNo">料号 *</Label>
          <Input id="partNo" placeholder="如 STM32F103C8T6" autoComplete="off" {...bind("partNo")} />
          {fieldErrors.partNo ? (
            <p className="text-xs text-destructive">{fieldErrors.partNo}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">名称 *</Label>
          <Input id="name" placeholder="如 MCU STM32F103C8T6" autoComplete="off" {...bind("name")} />
          {fieldErrors.name ? (
            <p className="text-xs text-destructive">{fieldErrors.name}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mpn">型号（MPN）</Label>
          <Input id="mpn" placeholder="如 STM32F103C8T6" autoComplete="off" {...bind("mpn")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand">品牌</Label>
          <Input id="brand" placeholder="如 厚声 / TI" autoComplete="off" {...bind("brand")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="packageName">封装</Label>
          <Input id="packageName" placeholder="如 0603 / QFN-24" autoComplete="off" {...bind("packageName")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">分类</Label>
          <Input id="category" placeholder="如 电阻 / WiFi模块" autoComplete="off" {...bind("category")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quantity">数量</Label>
          <Input id="quantity" type="number" min={0} inputMode="numeric" {...bind("quantity")} />
          {fieldErrors.quantity ? (
            <p className="text-xs text-destructive">{fieldErrors.quantity}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unit">单位</Label>
          <Input id="unit" placeholder="如 个 / 片 / 盘" autoComplete="off" {...bind("unit")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="packQty">打包数量</Label>
          <Input id="packQty" type="number" min={0} inputMode="numeric" placeholder="一盘/一卷多少颗，可留空" {...bind("packQty")} />
          {fieldErrors.packQty ? (
            <p className="text-xs text-destructive">{fieldErrors.packQty}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minStock">低库存阈值</Label>
          <Input id="minStock" type="number" min={0} inputMode="numeric" placeholder="0 或留空 = 用全局阈值" {...bind("minStock")} />
          {fieldErrors.minStock ? (
            <p className="text-xs text-destructive">{fieldErrors.minStock}</p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="specification">规格摘要</Label>
          <Input
            id="specification"
            placeholder="如 厚声 / 0603 / 常用（识别时会自动填成「品牌 / 封装 / 分类」）"
            autoComplete="off"
            {...bind("specification")}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="note">备注</Label>
          <Textarea
            id="note"
            rows={2}
            placeholder="人写的备注（识别自动写入的信息已存到下方「立创信息」里）"
            {...bind("note")}
          />
          {fieldErrors.note ? (
            <p className="text-xs text-destructive">{fieldErrors.note}</p>
          ) : null}
        </div>

        <details className="sm:col-span-2" open={hasLcscInfo || undefined}>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            立创信息 / 参数表（识别时自动写入，也可手动填）
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lcscCode">立创编号</Label>
              <Input id="lcscCode" placeholder="如 C42411897" autoComplete="off" className="font-mono" {...bind("lcscCode")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lcscId">立创商品 ID</Label>
              <Input id="lcscId" placeholder="如 44398166" autoComplete="off" className="font-mono" {...bind("lcscId")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="packType">包装形式</Label>
              <Input id="packType" placeholder="如 编带 / 管装 / 托盘" autoComplete="off" {...bind("packType")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="datasheetUrl">数据手册</Label>
              <Input id="datasheetUrl" placeholder="https://…（识别时自动填）" autoComplete="off" {...bind("datasheetUrl")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="imageUrl">参考图链接</Label>
              <Input id="imageUrl" placeholder="https://…（识别时自动填）" autoComplete="off" {...bind("imageUrl")} />
              {values.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- 任意远程图，不走 next/image 优化 */
                <img
                  src={displayAssetUrl(values.imageUrl, "image")}
                  alt="元件参考图"
                  className="mt-2 h-24 w-auto rounded-lg border border-border object-contain"
                />
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="paramsText">参数表</Label>
              <Textarea
                id="paramsText"
                rows={5}
                placeholder={"每行一条，用 = 分隔，例如：\n核心芯片=RTL8189FTV-VC-CG\n支持协议=IEEE802.11b/g/n\n工作电压=3V~3.5V"}
                className="font-mono text-xs"
                {...bind("paramsText")}
              />
              {fieldErrors.paramsText ? (
                <p className="text-xs text-destructive">{fieldErrors.paramsText}</p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              这些字段由「入库 → 立创识别」自动填好；参数表会进入搜索（例如搜「3.3V」或「QFN」都能找到）。
            </p>
          </div>
        </details>

        <details className="sm:col-span-2" open={needsAdvanced || undefined}>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            高级：合并 / 替换确认（保存被拦下时来这里勾选）
          </summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmMerge}
                onCheckedChange={(checked) => setConfirmMerge(checked === true)}
              />
              <span>
                人工确认后合并: 若检测到同料号或同参数物料，保存时将数量合并到已存在位置
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmPositionChange}
                onCheckedChange={(checked) => setConfirmPositionChange(checked === true)}
              />
              <span>我确认替换当前位物料（会改变该位置原有绑定）</span>
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
          <span className="text-xs text-muted-foreground">
            保存后返回宫格；从搜索进入时会返回搜索结果。
          </span>
        </div>
      </form>

      {component ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-border/70 pt-4">
          <Button variant="outline" onClick={handleToggle} disabled={toggling}>
            {toggling ? "处理中…" : component.enabled ? "停用" : "启用"}
          </Button>

          <form onSubmit={handleDelete} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="deleteConfirmSlot">
                删除确认（输入当前位置编号 {slotCode}）
              </Label>
              <Input
                id="deleteConfirmSlot"
                placeholder={`请输入 ${slotCode}`}
                autoComplete="off"
                className="w-44"
                value={deleteConfirmSlot}
                onChange={(event) => setDeleteConfirmSlot(event.target.value)}
              />
            </div>
            <Button type="submit" variant="destructive" disabled={deleting}>
              {deleting ? "删除中…" : "删除"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
