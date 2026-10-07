import type { Box, BoxType, Component, EventType, InventoryData } from "./types";

/** 事件保留上限（超出自动裁剪旧事件） */
export const EVENT_LIMIT = 5000;

export function nowIso(): string {
  return new Date().toISOString();
}

// ── 盒型 ─────────────────────────────────────────────────────────────────────

export interface BoxTypeMeta {
  label: string;
  defaultCapacity: number;
  defaultDesc: string;
  defaultPrefix: string;
  /** 格位网格列数（0 = 自适应） */
  layoutCols: number;
  /** 编号排列方向：row = 横向逐排（1,2,3,4…），col = 竖向逐列（1..10 一列再下一列） */
  layoutOrder: "row" | "col";
}

export const DEFAULT_BOX_TYPES: Record<BoxType, BoxTypeMeta> = {
  small_28: {
    label: "28格小盒大盒",
    defaultCapacity: 28,
    defaultDesc: "4 列 × 7 排小盒，编号横向逐排（1,2,3,4…）",
    defaultPrefix: "A",
    layoutCols: 4,
    layoutOrder: "row",
  },
  medium_30: {
    label: "30格中盒大盒",
    defaultCapacity: 30,
    defaultDesc: "3 列 × 10 排中盒，编号竖向逐列（1…10 一列，再下一列）",
    defaultPrefix: "B",
    layoutCols: 3,
    layoutOrder: "col",
  },
  custom: {
    label: "自定义容器",
    defaultCapacity: 20,
    defaultDesc: "可按实际盒型设置格数与编号前缀",
    defaultPrefix: "C",
    layoutCols: 0,
    layoutOrder: "row",
  },
  bag: {
    label: "袋装清单",
    defaultCapacity: 28,
    defaultDesc: "一袋一种器件，按清单管理",
    defaultPrefix: "BAG",
    layoutCols: 1,
    layoutOrder: "row",
  },
};

/**
 * 按实物排列重排格位：
 * - row：1,2,3,4 / 5,6,7,8（横向逐排）
 * - col：1,2,3…10 竖着排满一列再排下一列
 */
export function orderSlotsForLayout<T extends { slot: number }>(
  slots: T[],
  cols: number,
  order: "row" | "col",
  capacity: number,
): T[] {
  if (order !== "col" || cols <= 0) return slots;
  const rows = Math.max(1, Math.ceil(capacity / cols));
  return [...slots].sort((a, b) => {
    const ai = a.slot - 1;
    const bi = b.slot - 1;
    const aVisual = (ai % rows) * cols + Math.floor(ai / rows);
    const bVisual = (bi % rows) * cols + Math.floor(bi / rows);
    return aVisual - bVisual;
  });
}

// ── 基础查找 ─────────────────────────────────────────────────────────────────

export function findBox(data: InventoryData, id: number): Box | null {
  return data.boxes.find((box) => box.id === id) ?? null;
}

export function findComponent(data: InventoryData, id: number): Component | null {
  return data.components.find((component) => component.id === id) ?? null;
}

export function findComponentAt(
  data: InventoryData,
  boxId: number,
  slotIndex: number,
): Component | null {
  return (
    data.components.find((c) => c.boxId === boxId && c.slotIndex === slotIndex) ?? null
  );
}

export function componentsOfBox(data: InventoryData, boxId: number): Component[] {
  return data.components.filter((c) => c.boxId === boxId);
}

export function enabledComponentsOfBox(data: InventoryData, boxId: number): Component[] {
  return data.components.filter((c) => c.boxId === boxId && c.enabled);
}

/** 取号并自增（JSON 自增主键） */
export function takeId(data: InventoryData, key: keyof InventoryData["nextId"]): number {
  const id = data.nextId[key];
  data.nextId[key] = id + 1;
  return id;
}

// ── 槽位编号 ─────────────────────────────────────────────────────────────────

export function slotCodeForBox(box: Box, slotIndex: number): string {
  return `${box.slotPrefix}${box.startNumber + slotIndex - 1}`;
}

export function slotRangeLabel(box: Box): string {
  return `${slotCodeForBox(box, 1)}-${slotCodeForBox(box, box.slotCapacity)}`;
}

export function compareBoxes(a: Box, b: Box): number {
  const pa = (a.slotPrefix || "").toUpperCase();
  const pb = (b.slotPrefix || "").toUpperCase();
  if (pa !== pb) return pa < pb ? -1 : 1;
  if (a.startNumber !== b.startNumber) return a.startNumber - b.startNumber;
  return (a.name || "").localeCompare(b.name || "");
}

export function composeBoxName(
  baseName: string,
  prefix: string,
  startNumber: number,
  slotCapacity: number,
): string {
  const base = (baseName || "").trim() || "盒子";
  const endNumber = startNumber + slotCapacity - 1;
  return `${base} ${prefix}${startNumber}-${prefix}${endNumber}`;
}

export function makeUniqueBoxName(
  data: InventoryData,
  candidateName: string,
  excludeBoxId?: number,
): string {
  let name = candidateName;
  let counter = 2;
  for (;;) {
    const clash = data.boxes.some(
      (box) => box.name === name && box.id !== excludeBoxId,
    );
    if (!clash) return name;
    name = `${candidateName} #${counter}`;
    counter += 1;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inferBaseName(box: Box): string {
  const prefix = escapeRegExp(box.slotPrefix);
  const pattern = new RegExp(`\\s+${prefix}\\d+-${prefix}\\d+(?:\\s+#\\d+)?$`);
  const base = box.name.replace(pattern, "").trim();
  return base || box.name;
}

// ── 编号范围冲突 ─────────────────────────────────────────────────────────────

export interface RangeInput {
  boxType: BoxType;
  prefix: string;
  startNumber: number;
  slotCapacity: number;
  excludeBoxId?: number;
}

export function hasRangeConflict(data: InventoryData, input: RangeInput): Box | null {
  const endNumber = input.startNumber + input.slotCapacity - 1;
  for (const box of data.boxes) {
    if (box.boxType !== input.boxType) continue;
    if (box.slotPrefix !== input.prefix) continue;
    if (input.excludeBoxId !== undefined && box.id === input.excludeBoxId) continue;
    const boxEnd = box.startNumber + box.slotCapacity - 1;
    if (box.startNumber <= endNumber && input.startNumber <= boxEnd) return box;
  }
  return null;
}

export function suggestNextStartNumber(
  data: InventoryData,
  input: Omit<RangeInput, "startNumber" | "slotCapacity">,
): number {
  let maxEnd = 0;
  for (const box of data.boxes) {
    if (box.boxType !== input.boxType || box.slotPrefix !== input.prefix) continue;
    if (input.excludeBoxId !== undefined && box.id === input.excludeBoxId) continue;
    maxEnd = Math.max(maxEnd, box.startNumber + box.slotCapacity - 1);
  }
  return maxEnd + 1;
}

// ── 盒子分组 / 概览 ──────────────────────────────────────────────────────────

export interface OverviewRow {
  slotCode: string;
  name: string;
  partNo: string;
}

export interface BoxGroupItem {
  box: Box;
  slotRange: string;
  usedCount: number;
  overviewRows: OverviewRow[];
  baseName: string;
}

export type BoxGroups = Record<BoxType, BoxGroupItem[]>;

export function makeOverviewRows(data: InventoryData, box: Box): OverviewRow[] {
  return enabledComponentsOfBox(data, box.id)
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((c) => ({
      slotCode: slotCodeForBox(box, c.slotIndex),
      name: c.name,
      partNo: c.partNo,
    }));
}

export function buildBoxGroups(data: InventoryData): BoxGroups {
  const groups: BoxGroups = { small_28: [], medium_30: [], custom: [], bag: [] };
  const boxes = [...data.boxes].sort(compareBoxes);
  for (const box of boxes) {
    const enabled = enabledComponentsOfBox(data, box.id).sort(
      (a, b) => a.slotIndex - b.slotIndex,
    );
    groups[box.boxType].push({
      box,
      slotRange: slotRangeLabel(box),
      usedCount: enabled.length,
      overviewRows: enabled.map((c) => ({
        slotCode: slotCodeForBox(box, c.slotIndex),
        name: c.name,
        partNo: c.partNo,
      })),
      baseName: box.baseName || inferBaseName(box),
    });
  }
  return groups;
}

// ── 格位数据 ─────────────────────────────────────────────────────────────────

export interface SlotSpecFields {
  brand: string;
  package: string;
  usage: string;
}

export interface SlotItem {
  slot: number;
  slotCode: string;
  component: Component | null;
  lcscCode: string;
  specFields: SlotSpecFields;
}

export function parseSlotSpecFields(specification: string): SlotSpecFields {
  const parts = (specification || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    brand: parts[0] ?? "",
    package: parts[1] ?? "",
    usage: parts[2] ?? "",
  };
}

export function parseNoteDetailFields(note: string): {
  lcscCode: string;
  productId: string;
  arrange: string;
  minPack: string;
} {
  const raw = note || "";
  const lcscCode = extractLcscCodeFromText(raw);
  const idMatch = raw.match(/\b(?:ID|productId)\s*(\d+)\b/i);
  const arrangeMatch = raw.match(/编排\s*([^|]+)/);
  const minPackMatch = raw.match(/最小包装\s*([^|]+)/);
  return {
    lcscCode,
    productId: idMatch ? idMatch[1] : "",
    arrange: arrangeMatch ? arrangeMatch[1].trim() : "",
    minPack: minPackMatch ? minPackMatch[1].trim() : "",
  };
}

export function slotDataForBox(data: InventoryData, box: Box): SlotItem[] {
  const slotMap = new Map<number, Component>();
  for (const c of componentsOfBox(data, box.id)) slotMap.set(c.slotIndex, c);
  const slots: SlotItem[] = [];
  for (let slot = 1; slot <= box.slotCapacity; slot += 1) {
    const component = slotMap.get(slot) ?? null;
    let lcscCode = component ? extractLcscCodeFromText(component.note) : "";
    if (!lcscCode && component) lcscCode = extractLcscCodeFromText(component.partNo);
    slots.push({
      slot,
      slotCode: slotCodeForBox(box, slot),
      component,
      lcscCode,
      specFields: component
        ? parseSlotSpecFields(component.specification)
        : { brand: "", package: "", usage: "" },
    });
  }
  return slots;
}

export function bagRowsForBox(data: InventoryData, box: Box) {
  return componentsOfBox(data, box.id)
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((component) => ({
      component,
      slotCode: slotCodeForBox(box, component.slotIndex),
    }));
}

export interface StockInSlotOption {
  index: number;
  code: string;
}

export interface StockInBoxOption {
  id: number;
  name: string;
  emptySlots: StockInSlotOption[];
}

/** 供「快速入库」弹窗选择容器/位置 */
export function buildStockInBoxes(data: InventoryData): StockInBoxOption[] {
  return [...data.boxes].sort(compareBoxes).map((box) => ({
    id: box.id,
    name: box.name,
    emptySlots: slotDataForBox(data, box)
      .filter((slot) => !slot.component)
      .map((slot) => ({ index: slot.slot, code: slot.slotCode })),
  }));
}

export function formatComponentPosition(data: InventoryData, component: Component): string {
  const box = findBox(data, component.boxId);
  if (!box) return `盒子#${component.boxId} 位置#${component.slotIndex}`;
  return `${box.name} ${slotCodeForBox(box, component.slotIndex)}`;
}

// ── 文本归一化（原 utils/helpers.py 移植） ───────────────────────────────────

export function normalizeMaterialText(text: string): string {
  let raw = (text || "").toUpperCase().trim();
  if (!raw) return "";
  raw = raw.replace(/（/g, "(").replace(/）/g, ")");
  raw = raw.replace(/Ω|欧\s*姆?/g, "OHM");
  raw = raw.replace(/法\s*拉?|FARAD?/g, "FARAD");
  raw = raw.replace(/亨\s*利?|HENRY?/g, "HENRY");
  raw = raw.replace(/伏\s*特?|VOLT?/g, "VOLT");
  raw = raw.replace(/安\s*培?|AMP\s*(ERE)?/g, "AMP");
  raw = raw.replace(/瓦\s*特?|WATT?/g, "WATT");
  raw = raw.replace(/赫\s*兹?|HERZT?|HERTZ?/g, "HERTZ");
  raw = raw.replace(/[\s\-_/,|;：，。；：()\[\]{}]/g, "");
  return raw;
}

export function materialIdentityKey(name: string, specification: string): string {
  const nameKey = normalizeMaterialText(name);
  const specKey = normalizeMaterialText(specification);
  if (!nameKey && !specKey) return "";
  return `${nameKey}|${specKey}`;
}

export function compactSpaces(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function extractLcscCodeFromText(text: string): string {
  const match = (text || "").toUpperCase().match(/\bC\d{3,}\b/);
  return match ? match[0] : "";
}

type UnitMap = [RegExp, [string, string][]];

const UNIT_MAPS: UnitMap[] = [
  [/Ω/, [["Ω", "欧"], ["Ω", "OHM"], ["Ω", "ohm"]]],
  [/欧\s*姆?/, [["欧姆", "Ω"], ["欧姆", "OHM"], ["欧姆", "ohm"]]],
  [/OHM/i, [["OHM", "Ω"], ["OHM", "欧"], ["OHM", "ohm"]]],
  [/V(?![A-Za-z])/i, [["V", "伏"], ["V", "VOLT"], ["V", "v"]]],
  [/伏\s*特?/, [["伏特", "V"], ["伏特", "VOLT"], ["伏特", "v"]]],
  [/A(?![A-Za-z])/i, [["A", "安"], ["A", "AMP"], ["A", "a"]]],
  [/安\s*培?/, [["安培", "A"], ["安培", "AMP"], ["安培", "a"]]],
  [/W(?![A-Za-z])/i, [["W", "瓦"], ["W", "WATT"], ["W", "w"]]],
  [/瓦\s*特?/, [["瓦特", "W"], ["瓦特", "WATT"], ["瓦特", "w"]]],
  [/F(?!A)/i, [["F", "法"], ["F", "FARAD"], ["F", "f"]]],
  [/法\s*拉?/, [["法拉", "F"], ["法拉", "FARAD"], ["法拉", "f"]]],
  [/H(?![A-Za-z]|ENRY)/i, [["H", "亨"], ["H", "HENRY"], ["H", "h"]]],
  [/亨\s*利?/, [["亨利", "H"], ["亨利", "HENRY"], ["亨利", "h"]]],
  [/Hz/i, [["HZ", "赫"], ["HZ", "HERTZ"]]],
  [/赫\s*兹?/, [["赫兹", "Hz"], ["赫兹", "HERTZ"]]],
  [/pF/i, [["pF", "PF"], ["pF", "pf"]]],
  [/nF/i, [["nF", "NF"], ["nF", "nf"]]],
  [/uF/i, [["uF", "UF"], ["uF", "μF"], ["uF", "uF"]]],
];

/** 为搜索词生成常见单位变体（中/英/符号），最多 8 个 */
export function expandUnitVariants(term: string): string[] {
  if (!term) return [];
  let variants = new Set<string>([term]);
  for (let round = 0; round < 2; round += 1) {
    const next = new Set(variants);
    for (const v of variants) {
      for (const [pattern, replacements] of UNIT_MAPS) {
        if (!pattern.test(v)) continue;
        for (const [, replacement] of replacements) {
          const changed = v.replace(pattern, replacement);
          if (changed !== v) next.add(changed);
        }
      }
    }
    if (next.size === variants.size) break;
    variants = next;
    if (variants.size > 8) break;
  }
  return Array.from(variants).slice(0, 8);
}

// ── 冲突检测 / 合并（原 services/inventory_service.py 移植） ─────────────────

export function findEnabledPartNoConflict(
  data: InventoryData,
  partNo: string,
  excludeComponentId?: number,
): Component | null {
  const normalized = (partNo || "").trim();
  if (!normalized) return null;
  const candidates = data.components
    .filter((c) => c.enabled && c.partNo === normalized)
    .filter((c) => c.id !== excludeComponentId)
    .sort((a, b) => (a.boxId !== b.boxId ? a.boxId - b.boxId : a.slotIndex - b.slotIndex));
  return candidates[0] ?? null;
}

export function findEnabledMaterialConflict(
  data: InventoryData,
  name: string,
  specification: string,
  excludeComponentId?: number,
  excludePartNo?: string,
): Component | null {
  const targetKey = materialIdentityKey(name, specification);
  if (!targetKey) return null;
  const normalizedName = normalizeMaterialText(name);
  const normalizedExclude = (excludePartNo || "").trim();
  const candidates = data.components
    .filter((c) => c.enabled)
    .filter((c) => c.id !== excludeComponentId)
    .filter((c) => {
      if (normalizedExclude && (c.partNo || "").trim() === normalizedExclude) return false;
      if (normalizedName) {
        const prefix = normalizedName.slice(0, 6);
        if (!normalizeMaterialText(c.name).includes(prefix)) return false;
      }
      return materialIdentityKey(c.name, c.specification) === targetKey;
    })
    .sort((a, b) => (a.boxId !== b.boxId ? a.boxId - b.boxId : a.slotIndex - b.slotIndex));
  return candidates[0] ?? null;
}

export function isSlotPartReplacement(
  component: Component | null,
  newPartNo: string,
): boolean {
  if (!component) return false;
  const oldPartNo = (component.partNo || "").trim();
  const target = (newPartNo || "").trim();
  return Boolean(oldPartNo && target && oldPartNo !== target);
}

export function appendMergePartNoNote(note: string, partNo: string): string {
  const normalized = (partNo || "").trim();
  if (!normalized) return note || "";
  const line = `合并料号: ${normalized}`;
  const current = note || "";
  if (current.includes(line)) return current;
  return `${current}\n${line}`.trim();
}

/** 新建元件记录（字段集中在这里，避免各处手写漏字段） */
export function blankComponent(
  data: InventoryData,
  boxId: number,
  slotIndex: number,
): Component {
  const now = nowIso();
  return {
    id: takeId(data, "component"),
    boxId,
    slotIndex,
    partNo: "",
    name: "",
    specification: "",
    mpn: "",
    brand: "",
    packageName: "",
    category: "",
    lcscCode: "",
    lcscId: "",
    params: [],
    datasheetUrl: "",
    imageUrl: "",
    packType: "",
    packQty: 0,
    unit: "",
    minStock: 0,
    quantity: 0,
    note: "",
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export interface MergeOptions {
  target: Component;
  incomingPartNo: string;
  incomingName: string;
  incomingSpecification: string;
  incomingNote: string;
  incomingQuantity: number;
  incomingMpn?: string;
  incomingBrand?: string;
  incomingPackageName?: string;
  incomingCategory?: string;
  incomingLcscCode?: string;
  incomingLcscId?: string;
  incomingDatasheetUrl?: string;
  incomingImageUrl?: string;
  incomingPackType?: string;
  incomingPackQty?: number;
  incomingUnit?: string;
  incomingParams?: Component["params"];
  sourceComponent?: Component | null;
}

/** 人工确认合并：把来料并入 target，清理源格位（会写事件） */
export function mergeIntoExistingComponent(
  data: InventoryData,
  options: MergeOptions,
): void {
  const target = options.target;
  const oldTargetEnabledQty = target.enabled ? target.quantity : 0;
  const incomingPartNo = (options.incomingPartNo || "").trim();
  if (options.incomingName) target.name = options.incomingName;
  if (options.incomingSpecification) target.specification = options.incomingSpecification;
  if (options.incomingNote) target.note = options.incomingNote;
  // 结构化字段（品牌/封装/参数表…）：只在目标为空时补齐，不覆盖已有内容
  if (!target.mpn && options.incomingMpn) target.mpn = options.incomingMpn;
  if (!target.brand && options.incomingBrand) target.brand = options.incomingBrand;
  if (!target.packageName && options.incomingPackageName) {
    target.packageName = options.incomingPackageName;
  }
  if (!target.category && options.incomingCategory) target.category = options.incomingCategory;
  if (!target.lcscCode && options.incomingLcscCode) target.lcscCode = options.incomingLcscCode;
  if (!target.lcscId && options.incomingLcscId) target.lcscId = options.incomingLcscId;
  if (!target.datasheetUrl && options.incomingDatasheetUrl) {
    target.datasheetUrl = options.incomingDatasheetUrl;
  }
  if (!target.imageUrl && options.incomingImageUrl) target.imageUrl = options.incomingImageUrl;
  if (!target.packType && options.incomingPackType) target.packType = options.incomingPackType;
  if (!target.packQty && options.incomingPackQty) target.packQty = options.incomingPackQty;
  if (!target.unit && options.incomingUnit) target.unit = options.incomingUnit;
  if (!target.params.length && options.incomingParams?.length) {
    target.params = options.incomingParams;
  }
  if (incomingPartNo && incomingPartNo !== target.partNo) {
    target.note = appendMergePartNoNote(target.note, incomingPartNo);
  }
  target.quantity += Math.trunc(options.incomingQuantity) || 0;
  target.enabled = true;
  target.updatedAt = nowIso();
  const targetDelta = target.quantity - oldTargetEnabledQty;
  if (targetDelta) {
    logInventoryEvent(data, {
      type: "component_merge_confirmed",
      delta: targetDelta,
      box: findBox(data, target.boxId),
      component: target,
      partNo: target.partNo,
    });
  }
  const source = options.sourceComponent ?? null;
  if (source && source.id !== target.id) {
    if (source.enabled && source.quantity) {
      logInventoryEvent(data, {
        type: "component_merge_cleanup",
        delta: -source.quantity,
        box: findBox(data, source.boxId),
        component: source,
        partNo: source.partNo,
      });
    }
    data.components = data.components.filter((c) => c.id !== source.id);
  }
}

// ── 库存事件 ─────────────────────────────────────────────────────────────────

export function logInventoryEvent(
  data: InventoryData,
  input: {
    type: EventType;
    delta: number;
    box?: Box | null;
    component?: Component | null;
    partNo?: string;
  },
): void {
  const box = input.box ?? null;
  const component = input.component ?? null;
  data.events.push({
    id: takeId(data, "event"),
    at: nowIso(),
    type: input.type,
    boxId: box?.id ?? component?.boxId ?? null,
    componentId: component?.id ?? null,
    partNo: (input.partNo || component?.partNo || "").trim(),
    delta: Math.trunc(input.delta) || 0,
  });
  trimEvents(data);
}

export function trimEvents(data: InventoryData): void {
  if (data.events.length <= EVENT_LIMIT) return;
  data.events = data.events.slice(data.events.length - EVENT_LIMIT);
}

// ── 搜索常量（M2 使用，源自原 utils/constants.py） ──────────────────────────

export const SEARCH_MAX_CANDIDATES = 800;
export const SEARCH_MIN_DISPLAY_SCORE = 3.0;

export const SEARCH_FIELD_WEIGHTS = {
  partNo: 6,
  name: 5,
  specification: 4,
  note: 3,
} as const;

export const SEARCH_GENERIC_TERMS = new Set([
  "元件",
  "器件",
  "相关",
  "相关器件",
  "型号",
  "物料",
  "库存",
  "电子",
]);

export const SEARCH_NOTE_HINT_TERMS = new Set([
  "常用",
  "项目",
  "样品",
  "替代",
  "调试",
  "电源",
  "测试",
  "备件",
]);

export const COMPONENT_CATEGORY_HINTS: [string, string[]][] = [
  ["电阻", ["电阻", "resistor", "res"]],
  ["电容", ["电容", "capacitor", "cap"]],
  ["电感", ["电感", "inductor"]],
  ["稳压", ["稳压", "ldo", "regulator", "dc-dc", "dcdc"]],
  ["二极管", ["二极管", "diode", "tvs", "esd"]],
  ["三极管", ["三极管", "transistor", "mos", "mosfet", "bjt"]],
  ["接口", ["usb", "type-c", "uart", "rs485", "i2c", "spi", "can"]],
  ["MCU", ["mcu", "stm32", "esp32", "avr", "单片机"]],
  ["存储", ["eeprom", "flash", "存储"]],
  ["晶振", ["晶振", "oscillator", "crystal"]],
  ["连接器", ["连接器", "connector", "header", "socket"]],
  ["传感器", ["sensor", "传感器"]],
  ["驱动", ["driver", "驱动"]],
];

export const SEARCH_FUZZY_PROFILES = {
  strict: {
    label: "严格",
    fieldHit: 0.8,
    combinedHit: 0.78,
    softHit: 0.66,
    keywordHit: 0.74,
    keywordSoft: 0.62,
    scoreGate: 6.0,
    coverageGate: 0.48,
    highFuzzyGate: 0.9,
  },
  balanced: {
    label: "平衡",
    fieldHit: 0.75,
    combinedHit: 0.72,
    softHit: 0.6,
    keywordHit: 0.7,
    keywordSoft: 0.58,
    scoreGate: 4.5,
    coverageGate: 0.35,
    highFuzzyGate: 0.82,
  },
  loose: {
    label: "宽松",
    fieldHit: 0.7,
    combinedHit: 0.66,
    softHit: 0.54,
    keywordHit: 0.66,
    keywordSoft: 0.52,
    scoreGate: 3.0,
    coverageGate: 0.22,
    highFuzzyGate: 0.74,
  },
} as const;

export type SearchFuzziness = keyof typeof SEARCH_FUZZY_PROFILES;

export function parseSearchFuzziness(raw: string | undefined): SearchFuzziness {
  const value = (raw || "").trim().toLowerCase();
  if (value === "strict" || value === "loose") return value;
  return "balanced";
}

// ── 统计 ─────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function enabledQuantity(data: InventoryData, boxType?: BoxType): number {
  const boxIds = boxType
    ? new Set(data.boxes.filter((box) => box.boxType === boxType).map((box) => box.id))
    : null;
  return data.components
    .filter((component) => component.enabled)
    .filter((component) => !boxIds || boxIds.has(component.boxId))
    .reduce((sum, component) => sum + component.quantity, 0);
}

export interface TrendPoint {
  date: string;
  label: string;
  value: number;
}

/** 7/30 天库存趋势：从当前总量按事件回推（与原 Flask 版一致） */
export function buildTrendPoints(
  data: InventoryData,
  days: 7 | 30,
  boxType?: BoxType,
): TrendPoint[] {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime() - (days - 1) * DAY_MS;

  const boxTypeById = new Map(data.boxes.map((box) => [box.id, box.boxType]));
  const deltas = new Map<string, number>();
  for (const event of data.events) {
    const at = new Date(event.at);
    if (Number.isNaN(at.getTime()) || at.getTime() < cutoff) continue;
    if (boxType && event.boxId !== null && boxTypeById.get(event.boxId) !== boxType) continue;
    const key = dayKey(at);
    deltas.set(key, (deltas.get(key) ?? 0) + event.delta);
  }

  let running = enabledQuantity(data, boxType);
  const points: TrendPoint[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    const key = dayKey(day);
    points.push({ date: key, label: dayLabel(day), value: running });
    running -= deltas.get(key) ?? 0;
  }
  points.reverse();
  return points;
}

export interface TypeStat {
  key: BoxType;
  label: string;
  boxCount: number;
  itemCount: number;
  quantity: number;
  lowStockCount: number;
}

export function buildTypeStats(data: InventoryData): TypeStat[] {
  const threshold = data.settings.lowStockThreshold;
  return (Object.keys(DEFAULT_BOX_TYPES) as BoxType[]).map((key) => {
    const boxes = data.boxes.filter((box) => box.boxType === key);
    const boxIds = new Set(boxes.map((box) => box.id));
    const items = data.components.filter(
      (component) => component.enabled && boxIds.has(component.boxId),
    );
    return {
      key,
      label: DEFAULT_BOX_TYPES[key].label,
      boxCount: boxes.length,
      itemCount: items.length,
      quantity: items.reduce((sum, component) => sum + component.quantity, 0),
      lowStockCount: items.filter((component) => component.quantity < threshold).length,
    };
  });
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  component_save: "入库/修改",
  component_outbound: "出库",
  component_delete: "删除",
  component_enable: "启用",
  component_disable: "停用",
  component_merge_confirmed: "确认合并",
  component_merge_cleanup: "合并清理",
};

export interface EventRow {
  id: number;
  at: string;
  atLabel: string;
  type: EventType;
  typeLabel: string;
  partNo: string;
  delta: number;
  boxName: string;
  slotCode: string;
}

export function recentEventRows(data: InventoryData, limit = 20): EventRow[] {
  const componentById = new Map(data.components.map((component) => [component.id, component]));
  const boxById = new Map(data.boxes.map((box) => [box.id, box]));
  return [...data.events]
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map((event) => {
      const box = event.boxId !== null ? boxById.get(event.boxId) : undefined;
      const component =
        event.componentId !== null ? componentById.get(event.componentId) : undefined;
      const slotIndex = component?.slotIndex ?? null;
      const at = new Date(event.at);
      return {
        id: event.id,
        at: event.at,
        atLabel: Number.isNaN(at.getTime())
          ? event.at
          : `${dayKey(at)} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
        type: event.type,
        typeLabel: EVENT_TYPE_LABELS[event.type],
        partNo: event.partNo,
        delta: event.delta,
        boxName: box?.name ?? "",
        slotCode: box && slotIndex ? slotCodeForBox(box, slotIndex) : "",
      };
    });
}
