/**
 * 库存 CSV 导出：标签行（供「容器 / 宫格」页打印便签用）。
 *
 * 设计取舍（综合电阻电容与芯片两类）：
 * · 位置：只要格号（如 C1）—— 贴在实物上，位置就是抽屉号
 * · 名称：精简后（去掉与「封装」列重复的「封装:xxx」等段，过长截断）
 * · 封装：独立成列（0603 / SOT-23 / QFN-20 3x3）—— 抓料先看尺寸
 * · 料号：保留 —— 电阻电容是厂家 P/N（方便复购），芯片更是唯一识别符（AO3400 / STM32F103）
 */
import { slotCodeForBox } from "./domain";
import type { Box, Component } from "./types";

export interface LabelRow {
  /** 具体格号，如 C1、C2（不含容器名） */
  位置: string;
  /** 精简后的名称 */
  名称: string;
  /** 封装 / 尺寸 */
  封装: string;
  /** 型号 / 料号（识别与复购用） */
  料号: string;
  /** 索引签名：让它能直接交给 ExportCsvButton（Papa.unparse 按 key 取值） */
  [key: string]: string | number;
}

/** 名称里与独立列重复的段（封装/品牌/包装/系列）去掉，再压掉多余空白；过长截断 */
function shortName(name: string): string {
  const cleaned = name
    .replace(/(?:封装|品牌|包装|系列)\s*[:：]\s*\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 18 ? `${cleaned.slice(0, 17)}…` : cleaned;
}

/** 把元件列表转成标签行（按 盒 → 格 排序，方便按货架顺序打印） */
export function labelRowsFor(components: Component[], boxes: Box[]): LabelRow[] {
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  return components
    .filter((component) => component.enabled)
    .sort((a, b) => (a.boxId === b.boxId ? a.slotIndex - b.slotIndex : a.boxId - b.boxId))
    .map((component) => {
      const box = boxById.get(component.boxId);
      return {
        位置: box ? slotCodeForBox(box, component.slotIndex) : String(component.slotIndex),
        名称: shortName(component.name),
        封装: component.packageName,
        料号: component.partNo || component.mpn || component.lcscCode || "",
      };
    });
}
