import {
  extractLcscCodeFromText,
  parseNoteDetailFields,
  parseSlotSpecFields,
} from "./domain";
import type { Component, ComponentParam } from "./types";

/**
 * 库存字段的结构化辅助：
 * - 参数表文本 ↔ 数组（每行「名称=值」）
 * - 旧数据回填：把备注里由识别自动写入的「机器段」解析进结构化字段（幂等、非破坏）
 *
 * 背景：早期版本把 立创编号 / 商品 ID / 编排 / 最小包装 / 参数表 / 数据手册
 * 全部塞在备注里；现在这些字段有独立位置，备注回归「人写的话」。
 */

/** 机器写入的备注片段前缀（含早期格式「LCSC C… | ID … | 编排 … | 最小包装 …」） */
const MACHINE_PREFIX = /^(立创编号|立创ID|LCSC|ID|编排|最小包装|参数|数据手册)[\s:：]/;

/** 备注按 `|` 切段（旧格式用 ` | ` 连接） */
function segmentsOf(note: string): string[] {
  return note
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** 备注 → 人写的部分 + 机器段（用于表单拆分展示） */
export function splitNoteMachine(note: string): { human: string; machine: string[] } {
  const human: string[] = [];
  const machine: string[] = [];
  for (const segment of segmentsOf(note)) {
    if (MACHINE_PREFIX.test(segment)) machine.push(segment);
    else human.push(segment);
  }
  return { human: human.join(" | "), machine };
}

/** 只保留人写的备注 */
export function humanNote(note: string): string {
  return splitNoteMachine(note).human;
}

/** 取某个机器段的值（如「数据手册 https://…」→ URL） */
function machineValue(note: string, label: string): string {
  const needle = `${label} `;
  for (const segment of segmentsOf(note)) {
    if (segment.startsWith(needle)) return segment.slice(needle.length).trim();
  }
  return "";
}

/** 参数表文本 → 数组：每行「名称=值」（也接受全角冒号） */
export function parseParamsText(text: string): ComponentParam[] {
  const out: ComponentParam[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(.+?)\s*[=:：]\s*(.+)$/.exec(trimmed);
    if (!match) continue;
    const name = match[1].trim().slice(0, 80);
    const value = match[2].trim().slice(0, 300);
    if (!name || !value) continue;
    out.push({ name, value });
    if (out.length >= 80) break;
  }
  return out;
}

/** 参数数组 → 文本（每行「名称=值」） */
export function formatParamsText(params: ComponentParam[] | undefined): string {
  return (params ?? []).map((param) => `${param.name}=${param.value}`).join("\n");
}

/** 从旧备注的「参数 …；…」段解析参数表 */
function paramsFromNote(note: string): ComponentParam[] {
  const segment = segmentsOf(note).find((item) => /^参数\s*[:：]?/.test(item));
  if (!segment) return [];
  const body = segment.replace(/^参数\s*[:：]?\s*/, "");
  return body
    .split(/[；;]/)
    .map((pair) => {
      const index = pair.indexOf("=");
      if (index <= 0) return null;
      const name = pair.slice(0, index).trim().slice(0, 80);
      const value = pair.slice(index + 1).trim().slice(0, 300);
      return name && value ? { name, value } : null;
    })
    .filter((item): item is ComponentParam => item !== null)
    .slice(0, 80);
}

/** 用规格 + 备注里的旧数据补齐结构化字段（幂等、非破坏） */
export function backfillComponent(component: Component): Component {
  const spec = parseSlotSpecFields(component.specification);
  const detail = parseNoteDetailFields(component.note) ?? {};
  const next: Component = { ...component };

  if (!next.mpn) next.mpn = component.partNo;
  if (!next.brand) next.brand = String(spec.brand ?? "");
  if (!next.packageName) next.packageName = String(spec.package ?? "");
  if (!next.category) next.category = String(spec.usage ?? "");
  if (!next.lcscCode) {
    next.lcscCode =
      String(detail.lcscCode ?? "") || extractLcscCodeFromText(component.partNo);
  }
  if (!next.lcscId) {
    // 旧数据的备注里常见「LCSC item 1234567」这类写法
    const itemMatch = /LCSC\s*item\s*#?\s*(\d{4,})/i.exec(component.note);
    next.lcscId = String(detail.productId ?? "") || (itemMatch ? itemMatch[1] : "");
  }
  if (!next.packType) next.packType = String(detail.arrange ?? "");
  const minPack = String(detail.minPack ?? "");
  if (!next.packQty && minPack) {
    const match = /^(\d+)\s*(.*)$/.exec(minPack);
    if (match) {
      next.packQty = Number(match[1]) || 0;
      if (!next.unit) next.unit = match[2].trim();
    }
  }
  if (!next.datasheetUrl) next.datasheetUrl = machineValue(component.note, "数据手册");
  if (!next.params.length) next.params = paramsFromNote(component.note);
  return next;
}

/** 批量回填：读库时调用，结果在下次写回（保存任何元件）时落盘 */
export function backfillInventory<T extends { components: Component[] }>(data: T): T {
  let changed = false;
  const components = data.components.map((component) => {
    const next = backfillComponent(component);
    if (
      next.mpn !== component.mpn ||
      next.brand !== component.brand ||
      next.packageName !== component.packageName ||
      next.category !== component.category ||
      next.lcscCode !== component.lcscCode ||
      next.lcscId !== component.lcscId ||
      next.packType !== component.packType ||
      next.packQty !== component.packQty ||
      next.unit !== component.unit ||
      next.datasheetUrl !== component.datasheetUrl ||
      next.params.length !== component.params.length
    ) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...data, components } : data;
}
