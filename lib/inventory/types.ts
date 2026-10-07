import { z } from "zod";

/** 低库存阈值（与原项目一致） */
export const LOW_STOCK_THRESHOLD = 5;

export const BOX_TYPES = ["small_28", "medium_30", "custom", "bag"] as const;
export type BoxType = (typeof BOX_TYPES)[number];
export const boxTypeSchema = z.enum(BOX_TYPES);

export const EVENT_TYPES = [
  "component_save",
  "component_outbound",
  "component_delete",
  "component_enable",
  "component_disable",
  "component_merge_confirmed",
  "component_merge_cleanup",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const eventTypeSchema = z.enum(EVENT_TYPES);

const isoString = z.string().min(1);

export const boxSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(160),
  baseName: z.string().max(80).default(""),
  description: z.string().max(500).default(""),
  boxType: boxTypeSchema,
  slotCapacity: z.number().int().min(1).max(1000),
  slotPrefix: z.string().min(1).max(16),
  startNumber: z.number().int().min(0).max(1_000_000),
  createdAt: isoString,
  updatedAt: isoString,
});
export type Box = z.infer<typeof boxSchema>;

/** 元件参数（来自立创商城的参数表，如「核心芯片=RTL8189FTV-VC-CG」） */
export const componentParamSchema = z.object({
  name: z.string().max(80).default(""),
  value: z.string().max(300).default(""),
});
export type ComponentParam = z.infer<typeof componentParamSchema>;

const nonNegativeInt = z.number().int().min(0).max(10_000_000);

export const componentSchema = z.object({
  id: z.number().int().positive(),
  boxId: z.number().int().positive(),
  slotIndex: z.number().int().min(1).max(1000),
  /** 内部料号（列表里的主标识；通常与型号一致） */
  partNo: z.string().max(200).default(""),
  /** 名称/品名 */
  name: z.string().max(200).default(""),
  /** 规格摘要（沿用旧约定：品牌 / 封装 / 分类） */
  specification: z.string().max(500).default(""),
  /** 厂商型号 MPN */
  mpn: z.string().max(200).default(""),
  /** 品牌 */
  brand: z.string().max(160).default(""),
  /** 封装 */
  packageName: z.string().max(160).default(""),
  /** 分类 */
  category: z.string().max(160).default(""),
  /** 立创编号（C…） */
  lcscCode: z.string().max(40).default(""),
  /** 立创商城商品 ID */
  lcscId: z.string().max(40).default(""),
  /** 参数表 */
  params: z.array(componentParamSchema).max(80).default([]),
  /** 数据手册链接 */
  datasheetUrl: z.string().max(600).default(""),
  /** 参考图链接 */
  imageUrl: z.string().max(600).default(""),
  /** 包装形式（编带 / 管装 / 托盘 / 散装…） */
  packType: z.string().max(40).default(""),
  /** 最小包装数量（一盘/一卷多少颗） */
  packQty: nonNegativeInt.default(0),
  /** 计量单位（个 / 片 / 盘 / 袋…） */
  unit: z.string().max(16).default(""),
  /** 单品低库存阈值（0 = 用全局阈值） */
  minStock: nonNegativeInt.default(0),
  quantity: z.number().int().min(0).max(10_000_000).default(0),
  note: z.string().max(1000).default(""),
  enabled: z.boolean().default(true),
  createdAt: isoString,
  updatedAt: isoString,
});
export type Component = z.infer<typeof componentSchema>;

export const inventoryEventSchema = z.object({
  id: z.number().int().positive(),
  at: isoString,
  type: eventTypeSchema,
  boxId: z.number().int().positive().nullable().default(null),
  componentId: z.number().int().positive().nullable().default(null),
  partNo: z.string().max(200).default(""),
  delta: z.number().int(),
});
export type InventoryEvent = z.infer<typeof inventoryEventSchema>;

export const inventorySettingsSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(1000).default(LOW_STOCK_THRESHOLD),
  lockStorageMode: z.boolean().default(false),
});
export type InventorySettings = z.infer<typeof inventorySettingsSchema>;

export const nextIdSchema = z.object({
  box: z.number().int().min(1).default(1),
  component: z.number().int().min(1).default(1),
  event: z.number().int().min(1).default(1),
});
export type NextId = z.infer<typeof nextIdSchema>;

export const inventoryDataSchema = z.object({
  version: z.literal(1).default(1),
  nextId: nextIdSchema.default({ box: 1, component: 1, event: 1 }),
  settings: inventorySettingsSchema.default({
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    lockStorageMode: false,
  }),
  boxes: z.array(boxSchema).default([]),
  components: z.array(componentSchema).default([]),
  events: z.array(inventoryEventSchema).default([]),
});
export type InventoryData = z.infer<typeof inventoryDataSchema>;

export function emptyInventory(): InventoryData {
  return {
    version: 1,
    nextId: { box: 1, component: 1, event: 1 },
    settings: { lowStockThreshold: LOW_STOCK_THRESHOLD, lockStorageMode: false },
    boxes: [],
    components: [],
    events: [],
  };
}

function salvage<T>(raw: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function maxId(items: { id: number }[]): number {
  let max = 0;
  for (const item of items) {
    if (item.id > max) max = item.id;
  }
  return max;
}

/** 旧盒型键迁移（medium_14 → medium_30：实际中盒已改为 30 格） */
const LEGACY_BOX_TYPES: Record<
  string,
  { boxType: BoxType; fromCapacity: number; toCapacity: number }
> = {
  medium_14: { boxType: "medium_30", fromCapacity: 14, toCapacity: 30 },
};

function migrateLegacyBoxes(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.boxes)) return raw;
  let changed = false;
  const boxes = obj.boxes.map((item) => {
    if (!item || typeof item !== "object") return item;
    const box = { ...(item as Record<string, unknown>) };
    const legacy = typeof box.boxType === "string" ? LEGACY_BOX_TYPES[box.boxType] : undefined;
    if (!legacy) return item;
    changed = true;
    box.boxType = legacy.boxType;
    if (box.slotCapacity === legacy.fromCapacity) box.slotCapacity = legacy.toCapacity;
    return box;
  });
  return changed ? { ...obj, boxes } : raw;
}

/** 读取时归一化：整体解析失败则逐项抢救，保证坏数据不会导致整库不可用 */
export function sanitizeInventory(raw: unknown): InventoryData {
  const migrated = migrateLegacyBoxes(raw);
  const parsed = inventoryDataSchema.safeParse(migrated);
  if (parsed.success) return parsed.data;

  const base = emptyInventory();
  if (!migrated || typeof migrated !== "object") return base;
  const obj = migrated as Record<string, unknown>;

  const boxes = salvage(obj.boxes, boxSchema);
  const components = salvage(obj.components, componentSchema);
  const events = salvage(obj.events, inventoryEventSchema);
  const settings = inventorySettingsSchema.safeParse(obj.settings);
  const storedNext = nextIdSchema.safeParse(obj.nextId);

  return {
    version: 1,
    nextId: {
      box: Math.max(storedNext.success ? storedNext.data.box : 1, maxId(boxes) + 1),
      component: Math.max(
        storedNext.success ? storedNext.data.component : 1,
        maxId(components) + 1,
      ),
      event: Math.max(storedNext.success ? storedNext.data.event : 1, maxId(events) + 1),
    },
    settings: settings.success ? settings.data : base.settings,
    boxes,
    components,
    events,
  };
}

// ── 表单输入 ─────────────────────────────────────────────────────────────────

export function formBool(value: FormDataEntryValue | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function formText(value: FormDataEntryValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

const optionalInt = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.number().int().optional(),
);

export const boxInputSchema = z.object({
  boxType: boxTypeSchema,
  baseName: z.string().trim().max(80).default(""),
  slotPrefix: z.string().trim().max(16).default(""),
  description: z.string().trim().max(500).default(""),
  slotCapacity: optionalInt,
  startNumber: optionalInt,
});
export type BoxInput = z.infer<typeof boxInputSchema>;

export const componentSaveInputSchema = z.object({
  partNo: z.string().trim().min(1, "料号和名称不能为空").max(200),
  name: z.string().trim().min(1, "料号和名称不能为空").max(200),
  specification: z.string().trim().max(500).default(""),
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
  minStock: z.coerce.number().int().min(0).max(10_000_000).default(0),
  /** 参数表文本：每行「名称=值」（由 fields.ts 解析成 params 数组） */
  paramsText: z.string().max(4000).default(""),
  quantity: z.coerce
    .number()
    .int("数量必须是大于等于 0 的整数")
    .min(0, "数量必须是大于等于 0 的整数")
    .max(10_000_000),
  note: z.string().trim().max(1000).default(""),
});
export type ComponentSaveInput = z.infer<typeof componentSaveInputSchema>;

export const outboundInputSchema = z.object({
  amount: z.coerce
    .number()
    .int("出库数量必须是大于等于 0 的整数")
    .min(1, "出库数量必须大于 0")
    .max(10_000_000),
});
export type OutboundInput = z.infer<typeof outboundInputSchema>;
