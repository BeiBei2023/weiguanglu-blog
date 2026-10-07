"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server";
import {
  DEFAULT_BOX_TYPES,
  blankComponent,
  composeBoxName,
  findBox,
  findComponent,
  findComponentAt,
  findEnabledMaterialConflict,
  findEnabledPartNoConflict,
  formatComponentPosition,
  hasRangeConflict,
  isSlotPartReplacement,
  logInventoryEvent,
  makeUniqueBoxName,
  mergeIntoExistingComponent,
  nowIso,
  slotCodeForBox,
  suggestNextStartNumber,
  takeId,
} from "@/lib/inventory/domain";
import { countLocalAssets } from "@/lib/inventory/assets";
import { parseParamsText } from "@/lib/inventory/fields";
import { mutate, readInventory } from "@/lib/inventory/store";
import {
  boxInputSchema,
  componentSaveInputSchema,
  formBool,
  formText,
  outboundInputSchema,
} from "@/lib/inventory/types";

const MAX_SLOT_CAPACITY = 1000;

export interface ActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
  /** 出错时回填表单字段（React 表单 action 提交后会自动重置，需恢复用户输入） */
  values?: Record<string, string>;
}

export interface SuggestStartResult {
  ok: boolean;
  message?: string;
  startNumber?: number;
  slotPrefix?: string;
  previewRange?: string;
}

export interface InboundRowResult {
  line: number;
  status: "imported" | "merged" | "failed";
  message: string;
}

export interface InboundResult extends ActionResult {
  imported: number;
  merged: number;
  failed: InboundRowResult[];
  details: InboundRowResult[];
}

function fail(error: string, values?: Record<string, string>): ActionResult {
  return { ok: false, error, values };
}

/** 「整理数据」：把旧记录备注里的立创信息整理为结构化字段并落盘（幂等、非破坏） */
export async function tidyInventoryAction(): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;

  const stats = await mutate((data) => {
    const components = data.components;
    return {
      total: components.length,
      lcscCode: components.filter((component) => component.lcscCode).length,
      brand: components.filter((component) => component.brand).length,
      packageName: components.filter((component) => component.packageName).length,
      params: components.filter((component) => component.params.length > 0).length,
      datasheet: components.filter((component) => component.datasheetUrl).length,
    };
  });
  const assets = countLocalAssets();
  revalidateInventory();

  return {
    ok: true,
    notice:
      `整理完成：共 ${stats.total} 个元件 —— 立创编号 ${stats.lcscCode}、品牌 ${stats.brand}、` +
      `封装 ${stats.packageName}、参数表 ${stats.params}、数据手册 ${stats.datasheet}；` +
      `本地已存图片 ${assets.images} 张、手册 ${assets.datasheets} 份`,
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "输入不合法";
}

async function guard(): Promise<ActionResult | null> {
  const session = await getServerSession();
  if (!session) return fail("登录已失效，请重新登录");
  return null;
}

function revalidateInventory(): void {
  revalidatePath("/w/inventory");
  revalidatePath("/w/inventory/boxes");
  revalidatePath("/w/inventory/search");
  revalidatePath("/w/inventory/all");
  revalidatePath("/w/inventory/stats");
}

function parseId(raw: FormDataEntryValue | null): number | null {
  const value = Number(formText(raw).trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseSlot(raw: FormDataEntryValue | null): number | null {
  const value = Number(formText(raw).trim());
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function withQuery(base: string, params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

// ── 盒子 ─────────────────────────────────────────────────────────────────────

export async function createBoxAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const rawValues = {
    baseName: formText(formData.get("baseName")),
    slotPrefix: formText(formData.get("slotPrefix")),
    description: formText(formData.get("description")),
    slotCapacity: formText(formData.get("slotCapacity")),
    startNumber: formText(formData.get("startNumber")),
  };
  const parsed = boxInputSchema.safeParse({
    boxType: formText(formData.get("boxType")),
    ...rawValues,
  });
  if (!parsed.success) return fail(firstIssue(parsed.error), rawValues);

  const input = parsed.data;
  const meta = DEFAULT_BOX_TYPES[input.boxType];
  const slotPrefix = input.slotPrefix || meta.defaultPrefix;
  const baseName = input.baseName || meta.label;
  const slotCapacity =
    input.slotCapacity && input.slotCapacity >= 1
      ? Math.min(input.slotCapacity, MAX_SLOT_CAPACITY)
      : meta.defaultCapacity;
  const startNumber =
    input.startNumber !== undefined && input.startNumber >= 0 ? input.startNumber : 1;

  const created = await mutate<{ id: number } | { error: string }>((data) => {
    const conflict = hasRangeConflict(data, {
      boxType: input.boxType,
      prefix: slotPrefix,
      startNumber,
      slotCapacity,
    });
    if (conflict) return { error: `编号范围与${conflict.name}冲突` };
    const id = takeId(data, "box");
    const now = nowIso();
    data.boxes.push({
      id,
      name: makeUniqueBoxName(
        data,
        composeBoxName(baseName, slotPrefix, startNumber, slotCapacity),
      ),
      baseName,
      description: input.description,
      boxType: input.boxType,
      slotCapacity,
      slotPrefix,
      startNumber,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  });
  if ("error" in created) return fail(created.error, rawValues);

  revalidateInventory();
  const returnTo = formText(formData.get("returnTo")).trim();
  if (returnTo) redirect(`/w/inventory/boxes?type=${encodeURIComponent(returnTo)}`);
  redirect(`/w/inventory/box/${created.id}`);
}

export async function updateBoxAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const boxId = parseId(formData.get("boxId"));
  if (boxId === null) return fail("参数非法");
  const rawValues = {
    baseName: formText(formData.get("baseName")),
    slotPrefix: formText(formData.get("slotPrefix")),
    description: formText(formData.get("description")),
    slotCapacity: formText(formData.get("slotCapacity")),
    startNumber: formText(formData.get("startNumber")),
  };
  const parsed = boxInputSchema.safeParse({
    boxType: formText(formData.get("boxType")),
    ...rawValues,
  });
  if (!parsed.success) return fail(firstIssue(parsed.error), rawValues);
  const input = parsed.data;

  const result = await mutate<{ ok: true } | { error: string }>((data) => {
    const box = findBox(data, boxId);
    if (!box) return { error: "容器不存在" };
    const slotPrefix = input.slotPrefix || box.slotPrefix;
    const slotCapacity =
      input.slotCapacity && input.slotCapacity >= 1
        ? Math.min(input.slotCapacity, MAX_SLOT_CAPACITY)
        : box.slotCapacity;
    const startNumber =
      input.startNumber !== undefined && input.startNumber >= 0
        ? input.startNumber
        : box.startNumber;

    if (slotCapacity !== box.slotCapacity) {
      const maxUsed = data.components
        .filter((c) => c.boxId === box.id)
        .reduce((max, c) => Math.max(max, c.slotIndex), 0);
      if (maxUsed > slotCapacity) {
        return { error: `容量不能小于已使用位置 ${maxUsed}` };
      }
    }
    const conflict = hasRangeConflict(data, {
      boxType: box.boxType,
      prefix: slotPrefix,
      startNumber,
      slotCapacity,
      excludeBoxId: box.id,
    });
    if (conflict) return { error: `编号范围与${conflict.name}冲突` };

    box.slotPrefix = slotPrefix;
    box.slotCapacity = slotCapacity;
    box.startNumber = startNumber;
    box.description = input.description;
    if (input.baseName) {
      box.baseName = input.baseName;
      box.name = makeUniqueBoxName(
        data,
        composeBoxName(input.baseName, slotPrefix, startNumber, slotCapacity),
        box.id,
      );
    }
    box.updatedAt = nowIso();
    return { ok: true };
  });
  if ("error" in result) return fail(result.error, rawValues);

  revalidateInventory();
  redirect(`/w/inventory/box/${boxId}?notice=${encodeURIComponent("盒子信息已更新")}`);
}

export async function deleteBoxAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const boxId = parseId(formData.get("boxId"));
  if (boxId === null) return fail("参数非法");

  const result = await mutate<{ ok: true } | { error: string }>((data) => {
    const box = findBox(data, boxId);
    if (!box) return { error: "容器不存在" };
    if (
      box.boxType === "bag" &&
      data.boxes.filter((b) => b.boxType === "bag").length <= 1
    ) {
      return { error: "袋装清单必须保留至少一个" };
    }
    data.components = data.components.filter((c) => c.boxId !== boxId);
    data.events = data.events.filter((e) => e.boxId !== boxId);
    data.boxes = data.boxes.filter((b) => b.id !== boxId);
    return { ok: true };
  });
  if ("error" in result) return fail(result.error);

  revalidateInventory();
  const returnTo = formText(formData.get("returnTo")).trim();
  if (returnTo) {
    redirect(withQuery("/w/inventory/boxes", { type: returnTo, notice: "盒子已删除" }));
  }
  redirect(withQuery("/w/inventory/boxes", { notice: "盒子已删除" }));
}

export async function updateBagCapacityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const boxId = parseId(formData.get("boxId"));
  const rawCapacity = formText(formData.get("slotCapacity"));
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SLOT_CAPACITY)
    .safeParse(rawCapacity);
  if (boxId === null || !parsed.success) {
    return fail("袋位数量必须是大于等于 1 的整数", { slotCapacity: rawCapacity });
  }

  const result = await mutate<{ ok: true } | { error: string }>((data) => {
    const box = findBox(data, boxId);
    if (!box) return { error: "容器不存在" };
    if (box.boxType !== "bag") return { error: "当前容器不是袋装清单" };
    const maxUsed = data.components
      .filter((c) => c.boxId === box.id)
      .reduce((max, c) => Math.max(max, c.slotIndex), 0);
    if (maxUsed > parsed.data) {
      return { error: `袋位数量不能小于已使用位置 ${maxUsed}` };
    }
    box.slotCapacity = parsed.data;
    box.updatedAt = nowIso();
    return { ok: true };
  });
  if ("error" in result) return fail(result.error, { slotCapacity: rawCapacity });

  revalidateInventory();
  redirect(`/w/inventory/box/${boxId}?notice=${encodeURIComponent("袋位数量已更新")}`);
}

export async function suggestStartAction(input: {
  boxType: string;
  slotPrefix?: string;
  boxId?: number;
  slotCapacity?: number;
}): Promise<SuggestStartResult> {
  const g = await guard();
  if (g) return { ok: false, message: g.error };

  const boxType = input.boxType;
  const meta = DEFAULT_BOX_TYPES[boxType as keyof typeof DEFAULT_BOX_TYPES];
  if (!meta) return { ok: false, message: "无效的盒型" };
  const slotPrefix = (input.slotPrefix || "").trim() || meta.defaultPrefix;

  const data = await readInventory();
  const startNumber = suggestNextStartNumber(data, {
    boxType: boxType as keyof typeof DEFAULT_BOX_TYPES,
    prefix: slotPrefix,
    excludeBoxId: input.boxId,
  });
  const capacity =
    input.slotCapacity && input.slotCapacity >= 1 ? input.slotCapacity : meta.defaultCapacity;
  return {
    ok: true,
    startNumber,
    slotPrefix,
    previewRange: `${slotPrefix}${startNumber}-${slotPrefix}${startNumber + capacity - 1}`,
  };
}

// ── 元件 ─────────────────────────────────────────────────────────────────────

export async function saveComponentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const boxId = parseId(formData.get("boxId"));
  const slot = parseSlot(formData.get("slot"));
  if (boxId === null || slot === null) return fail("参数非法");

  const parsed = componentSaveInputSchema.safeParse({
    partNo: formText(formData.get("partNo")),
    name: formText(formData.get("name")),
    specification: formText(formData.get("specification")),
    mpn: formText(formData.get("mpn")),
    brand: formText(formData.get("brand")),
    packageName: formText(formData.get("packageName")),
    category: formText(formData.get("category")),
    lcscCode: formText(formData.get("lcscCode")),
    lcscId: formText(formData.get("lcscId")),
    datasheetUrl: formText(formData.get("datasheetUrl")),
    imageUrl: formText(formData.get("imageUrl")),
    packType: formText(formData.get("packType")),
    packQty: formText(formData.get("packQty")),
    unit: formText(formData.get("unit")),
    minStock: formText(formData.get("minStock")),
    paramsText: formText(formData.get("paramsText")),
    quantity: formText(formData.get("quantity")),
    note: formText(formData.get("note")),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const confirmMerge = formBool(formData.get("confirmMerge"));
  const confirmPositionChange = formBool(formData.get("confirmPositionChange"));
  const q = formText(formData.get("q")).trim();

  const params = parseParamsText(input.paramsText);
  const result = await mutate<
    { ok: true } | { ok: true; notice: string; redirectTo: string } | { error: string }
  >((data) => {
    const box = findBox(data, boxId);
    if (!box) return { error: "容器不存在" };
    if (slot < 1 || slot > box.slotCapacity) {
      return { error: "目标位置超出当前容器范围" };
    }
    const component = findComponentAt(data, boxId, slot);
    const lock = data.settings.lockStorageMode;

    if (lock && isSlotPartReplacement(component, input.partNo)) {
      return { error: "锁仓模式已开启，禁止替换当前位置绑定料号。" };
    }
    if (isSlotPartReplacement(component, input.partNo) && !confirmPositionChange) {
      return {
        error:
          '当前位已绑定到固定料号，检测到替换操作。如需变更位置绑定，请勾选"我确认替换当前位物料"后再保存',
      };
    }

    const currentId = component?.id;
    const partNoConflict = findEnabledPartNoConflict(data, input.partNo, currentId);
    const materialConflict = findEnabledMaterialConflict(
      data,
      input.name,
      input.specification,
      currentId,
      input.partNo,
    );
    const conflict = partNoConflict ?? materialConflict;
    if (conflict && !confirmMerge) {
      const reason = partNoConflict ? "同料号" : "同参数";
      return {
        error: `检测到${reason}物料已存在于 ${formatComponentPosition(
          data,
          conflict,
        )}；请勾选"人工确认后合并"再保存`,
      };
    }
    if (conflict && confirmMerge) {
      mergeIntoExistingComponent(data, {
        target: conflict,
        incomingPartNo: input.partNo,
        incomingName: input.name,
        incomingSpecification: input.specification,
        incomingNote: input.note,
        incomingQuantity: input.quantity,
        incomingMpn: input.mpn,
        incomingBrand: input.brand,
        incomingPackageName: input.packageName,
        incomingCategory: input.category,
        incomingLcscCode: input.lcscCode,
        incomingLcscId: input.lcscId,
        incomingDatasheetUrl: input.datasheetUrl,
        incomingImageUrl: input.imageUrl,
        incomingPackType: input.packType,
        incomingPackQty: input.packQty,
        incomingUnit: input.unit,
        incomingParams: params,
        sourceComponent: component,
      });
      return {
        ok: true,
        notice: `已人工确认合并到 ${formatComponentPosition(data, conflict)}，累计数量 ${conflict.quantity}`,
        redirectTo: `/w/inventory/box/${conflict.boxId}/slot/${conflict.slotIndex}`,
      };
    }

    const oldEnabledQty = component && component.enabled ? component.quantity : 0;
    let target = component;
    if (!target) {
      target = blankComponent(data, boxId, slot);
      data.components.push(target);
    }
    target.partNo = input.partNo;
    target.name = input.name;
    target.specification = input.specification;
    target.mpn = input.mpn;
    target.brand = input.brand;
    target.packageName = input.packageName;
    target.category = input.category;
    target.lcscCode = input.lcscCode;
    target.lcscId = input.lcscId;
    target.datasheetUrl = input.datasheetUrl;
    target.imageUrl = input.imageUrl;
    target.packType = input.packType;
    target.packQty = input.packQty;
    target.unit = input.unit;
    target.minStock = input.minStock;
    target.params = params;
    target.quantity = input.quantity;
    target.note = input.note;
    target.updatedAt = nowIso();
    const newEnabledQty = target.enabled ? target.quantity : 0;
    const delta = newEnabledQty - oldEnabledQty;
    if (delta) {
      logInventoryEvent(data, {
        type: "component_save",
        delta,
        box,
        component: target,
        partNo: target.partNo,
      });
    }
    return { ok: true };
  });

  if ("error" in result) return fail(result.error);
  revalidateInventory();
  if ("redirectTo" in result) {
    redirect(withQuery(result.redirectTo, { notice: result.notice, q }));
  }
  if (q) redirect(withQuery("/w/inventory/search", { q, notice: "位置已保存" }));
  redirect(withQuery(`/w/inventory/box/${boxId}`, { notice: "位置已保存" }));
}

export async function toggleComponentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const boxId = parseId(formData.get("boxId"));
  const slot = parseSlot(formData.get("slot"));
  if (boxId === null || slot === null) return fail("参数非法");
  const enable = formText(formData.get("enable")).trim() === "1";
  const q = formText(formData.get("q")).trim();

  const result = await mutate<{ ok: true } | { error: string }>((data) => {
    const box = findBox(data, boxId);
    if (!box) return { error: "容器不存在" };
    const component = findComponentAt(data, boxId, slot);
    if (!component) return { error: "该位置没有元件记录" };
    if (enable === component.enabled) return { ok: true };
    component.enabled = enable;
    component.updatedAt = nowIso();
    if (component.quantity) {
      logInventoryEvent(data, {
        type: enable ? "component_enable" : "component_disable",
        delta: enable ? component.quantity : -component.quantity,
        box,
        component,
        partNo: component.partNo,
      });
    }
    return { ok: true };
  });
  if ("error" in result) return fail(result.error);

  revalidateInventory();
  redirect(
    withQuery(`/w/inventory/box/${boxId}/slot/${slot}`, {
      q,
      notice: enable ? "已启用" : "已停用",
    }),
  );
}

export async function deleteComponentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const boxId = parseId(formData.get("boxId"));
  const slot = parseSlot(formData.get("slot"));
  if (boxId === null || slot === null) return fail("参数非法");
  const confirmSlot = formText(formData.get("deleteConfirmSlot")).trim().toUpperCase();
  const q = formText(formData.get("q")).trim();

  const result = await mutate<{ ok: true } | { error: string }>((data) => {
    const box = findBox(data, boxId);
    if (!box) return { error: "容器不存在" };
    if (data.settings.lockStorageMode) {
      return { error: "锁仓模式已开启，禁止删除位置绑定。" };
    }
    const expected = slotCodeForBox(box, slot).toUpperCase();
    if (confirmSlot !== expected) {
      return { error: `删除确认失败: 请输入当前位置编号 ${slotCodeForBox(box, slot)}` };
    }
    const component = findComponentAt(data, boxId, slot);
    if (component) {
      if (component.enabled && component.quantity) {
        logInventoryEvent(data, {
          type: "component_delete",
          delta: -component.quantity,
          box,
          component,
          partNo: component.partNo,
        });
      }
      data.components = data.components.filter((c) => c.id !== component.id);
    }
    return { ok: true };
  });
  if ("error" in result) return fail(result.error);

  revalidateInventory();
  if (q) redirect(withQuery("/w/inventory/search", { q, notice: "已删除" }));
  redirect(withQuery(`/w/inventory/box/${boxId}`, { notice: "已删除" }));
}

// ── 快速入库（规则解析，批量） ───────────────────────────────────────────────

const inboundRowSchema = z.object({
  partNo: z.string().trim().min(1, "料号不能为空").max(200),
  name: z.string().trim().min(1, "名称不能为空").max(200),
  quantity: z.coerce
    .number()
    .int("数量必须是整数")
    .min(0, "数量不能为负")
    .max(10_000_000),
  specification: z.string().trim().max(500).default(""),
  note: z.string().trim().max(1000).default(""),
  mpn: z.string().trim().max(200).default(""),
  brand: z.string().trim().max(160).default(""),
  packageName: z.string().trim().max(160).default(""),
  category: z.string().trim().max(160).default(""),
  lcscCode: z.string().trim().max(40).default(""),
  lcscId: z.string().trim().max(40).default(""),
  datasheetUrl: z.string().trim().max(600).default(""),
  imageUrl: z.string().trim().max(600).default(""),
  packType: z.string().trim().max(40).default(""),
  packQty: z.coerce.number().int().min(0).max(10_000_000).default(0),
  unit: z.string().trim().max(16).default(""),
  params: z
    .array(z.object({ name: z.string().max(80), value: z.string().max(300) }))
    .max(80)
    .default([]),
  /** 指定位置（不填则自动取下一个空位/袋位） */
  slotIndex: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(1000).optional(),
  ),
});

export async function quickInboundAction(input: {
  boxId: number;
  rows: unknown[];
}): Promise<InboundResult> {
  const g = await guard();
  if (g) {
    return { ...g, imported: 0, merged: 0, failed: [], details: [] };
  }

  const boxId = Number(input.boxId);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return { ok: false, error: "参数非法", imported: 0, merged: 0, failed: [], details: [] };
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    return { ok: false, error: "没有可导入的行", imported: 0, merged: 0, failed: [], details: [] };
  }
  if (input.rows.length > 200) {
    return { ok: false, error: "单次最多导入 200 行", imported: 0, merged: 0, failed: [], details: [] };
  }

  const rows: z.infer<typeof inboundRowSchema>[] = [];
  const failed: InboundRowResult[] = [];
  input.rows.forEach((raw, index) => {
    const parsed = inboundRowSchema.safeParse(raw);
    if (!parsed.success) {
      failed.push({
        line: index + 1,
        status: "failed",
        message: firstIssue(parsed.error),
      });
      return;
    }
    rows.push(parsed.data);
  });

  const result = await mutate<{
    imported: number;
    merged: number;
    details: InboundRowResult[];
  }>((data) => {
    const details: InboundRowResult[] = [];
    let imported = 0;
    let merged = 0;
    const box = findBox(data, boxId);
    if (!box) {
      return {
        imported: 0,
        merged: 0,
        details: [{ line: 0, status: "failed" as const, message: "容器不存在" }],
      };
    }

    const occupied = new Set(
      data.components.filter((c) => c.boxId === boxId).map((c) => c.slotIndex),
    );
    let cursor = 1;
    let nextBagSlot =
      data.components.filter((c) => c.boxId === boxId).reduce((max, c) => Math.max(max, c.slotIndex), 0) + 1;

    rows.forEach((row, index) => {
      const lineNo = index + 1;
      // 同料号 / 同参数 → 并入已有启用位置（点击"确认导入"即为确认）
      const partNoConflict = findEnabledPartNoConflict(data, row.partNo);
      const materialConflict = partNoConflict
        ? null
        : findEnabledMaterialConflict(data, row.name, row.specification, undefined, row.partNo);
      const conflict = partNoConflict ?? materialConflict;
      if (conflict) {
        const before = conflict.quantity;
        mergeIntoExistingComponent(data, {
          target: conflict,
          incomingPartNo: row.partNo,
          incomingName: row.name,
          incomingSpecification: row.specification,
          incomingNote: row.note,
          incomingQuantity: row.quantity,
          incomingMpn: row.mpn,
          incomingBrand: row.brand,
          incomingPackageName: row.packageName,
          incomingCategory: row.category,
          incomingLcscCode: row.lcscCode,
          incomingLcscId: row.lcscId,
          incomingDatasheetUrl: row.datasheetUrl,
          incomingImageUrl: row.imageUrl,
          incomingPackType: row.packType,
          incomingPackQty: row.packQty,
          incomingUnit: row.unit,
          incomingParams: row.params,
        });
        merged += 1;
        details.push({
          line: lineNo,
          status: "merged",
          message: `并入 ${formatComponentPosition(data, conflict)}（${before} → ${conflict.quantity}）`,
        });
        return;
      }

      let slotIndex: number;
      if (row.slotIndex !== undefined) {
        if (row.slotIndex > box.slotCapacity) {
          details.push({
            line: lineNo,
            status: "failed",
            message: `位置 ${slotCodeForBox(box, row.slotIndex)} 超出容器范围`,
          });
          return;
        }
        if (occupied.has(row.slotIndex)) {
          details.push({
            line: lineNo,
            status: "failed",
            message: `位置 ${slotCodeForBox(box, row.slotIndex)} 已被占用`,
          });
          return;
        }
        slotIndex = row.slotIndex;
        occupied.add(slotIndex);
      } else if (box.boxType === "bag") {
        slotIndex = nextBagSlot;
        if (slotIndex > box.slotCapacity) {
          details.push({
            line: lineNo,
            status: "failed",
            message: `袋位已满（容量 ${box.slotCapacity}），请先增加袋位数量`,
          });
          return;
        }
        nextBagSlot += 1;
      } else {
        while (cursor <= box.slotCapacity && occupied.has(cursor)) cursor += 1;
        if (cursor > box.slotCapacity) {
          details.push({
            line: lineNo,
            status: "failed",
            message: `没有空闲格位（容量 ${box.slotCapacity}）`,
          });
          return;
        }
        slotIndex = cursor;
        occupied.add(cursor);
        cursor += 1;
      }

      const component = blankComponent(data, boxId, slotIndex);
      component.partNo = row.partNo;
      component.name = row.name;
      component.specification = row.specification;
      component.quantity = row.quantity;
      component.note = row.note;
      component.mpn = row.mpn || row.partNo;
      component.brand = row.brand;
      component.packageName = row.packageName;
      component.category = row.category;
      component.lcscCode = row.lcscCode;
      component.lcscId = row.lcscId;
      component.datasheetUrl = row.datasheetUrl;
      component.imageUrl = row.imageUrl;
      component.packType = row.packType;
      component.packQty = row.packQty;
      component.unit = row.unit;
      component.params = row.params;
      data.components.push(component);
      imported += 1;
      if (row.quantity) {
        logInventoryEvent(data, {
          type: "component_save",
          delta: row.quantity,
          box,
          component,
          partNo: row.partNo,
        });
      }
      details.push({
        line: lineNo,
        status: "imported",
        message: `写入 ${slotCodeForBox(box, slotIndex)}`,
      });
    });

    return { imported, merged, details };
  });

  revalidateInventory();
  const allFailed = [...failed, ...result.details.filter((d) => d.status === "failed")];
  const ok = result.imported + result.merged > 0;
  return {
    ok,
    error: ok ? undefined : "没有导入任何行",
    imported: result.imported,
    merged: result.merged,
    failed: allFailed,
    details: [...result.details, ...failed],
  };
}

// ── 出库 ─────────────────────────────────────────────────────────────────────

export async function quickOutboundAction(input: {
  componentId: number;
  amount: number;
}): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const componentId = Number(input.componentId);
  if (!Number.isInteger(componentId) || componentId <= 0) return fail("参数非法");
  const parsed = outboundInputSchema.safeParse({ amount: input.amount });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const result = await mutate<{ ok: true; notice: string } | { error: string }>((data) => {
    const component = findComponent(data, componentId);
    if (!component) return { error: "元件不存在" };
    if (!component.enabled) return { error: "该元件已停用，不能出库" };
    if (parsed.data.amount > component.quantity) {
      return { error: "出库数量超过当前库存" };
    }
    component.quantity -= parsed.data.amount;
    component.updatedAt = nowIso();
    const box = findBox(data, component.boxId);
    logInventoryEvent(data, {
      type: "component_outbound",
      delta: -parsed.data.amount,
      box,
      component,
      partNo: component.partNo,
    });
    const slotCode = box
      ? slotCodeForBox(box, component.slotIndex)
      : String(component.slotIndex);
    return {
      ok: true,
      notice: `出库成功: ${component.partNo} -${parsed.data.amount}（${slotCode}）`,
    };
  });
  if ("error" in result) return fail(result.error);

  revalidateInventory();
  return { ok: true, notice: result.notice };
}

/** 快捷入库到已有位置（列表行内 + 按钮） */
export async function quickRestockAction(input: {
  componentId: number;
  amount: number;
}): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;

  const componentId = Number(input.componentId);
  if (!Number.isInteger(componentId) || componentId <= 0) return fail("参数非法");
  const parsed = outboundInputSchema.safeParse({ amount: input.amount });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const result = await mutate<{ ok: true; notice: string } | { error: string }>((data) => {
    const component = findComponent(data, componentId);
    if (!component) return { error: "元件不存在" };
    if (!component.enabled) return { error: "该元件已停用，请先启用再入库" };
    component.quantity += parsed.data.amount;
    component.updatedAt = nowIso();
    const box = findBox(data, component.boxId);
    logInventoryEvent(data, {
      type: "component_save",
      delta: parsed.data.amount,
      box,
      component,
      partNo: component.partNo,
    });
    const slotCode = box
      ? slotCodeForBox(box, component.slotIndex)
      : String(component.slotIndex);
    return {
      ok: true,
      notice: `入库成功: ${component.partNo} +${parsed.data.amount}（${slotCode}）`,
    };
  });
  if ("error" in result) return fail(result.error);

  revalidateInventory();
  return { ok: true, notice: result.notice };
}
