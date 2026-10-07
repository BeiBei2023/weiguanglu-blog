import fuzzysort from "fuzzysort";
import {
  COMPONENT_CATEGORY_HINTS,
  SEARCH_FIELD_WEIGHTS,
  SEARCH_FUZZY_PROFILES,
  SEARCH_GENERIC_TERMS,
  SEARCH_MAX_CANDIDATES,
  SEARCH_MIN_DISPLAY_SCORE,
  SEARCH_NOTE_HINT_TERMS,
  expandUnitVariants,
  normalizeMaterialText,
  slotCodeForBox,
  type SearchFuzziness,
} from "./domain";
import type { Component, InventoryData } from "./types";

export type SearchField = "partNo" | "name" | "specification" | "note";

export interface SearchFieldMap {
  partNo: string[];
  name: string[];
  specification: string[];
  note: string[];
}

/** 一个用户词及其（可能扩展的）匹配词 */
export interface SearchUnit {
  token: string;
  field: SearchField;
  terms: string[];
}

export interface SearchPlan {
  mode: "rule";
  query: string;
  fieldMap: SearchFieldMap;
  units: SearchUnit[];
  keywords: string[];
  summary: string;
}

export interface FuzzyMatch {
  term: string;
  field: SearchField;
  score: number;
}

export interface MatchInfo {
  isMatch: boolean;
  score: number;
  matchedFields: SearchField[];
  matchedTerms: string[];
  fuzzyMatches: FuzzyMatch[];
  coverage: number;
}

export interface SearchResultRow {
  component: Component;
  boxId: number;
  slotIndex: number;
  boxName: string;
  slotCode: string;
  matchSummary: string;
  matchedTerms: string[];
  matchScore: number;
  fuzzyMatches: FuzzyMatch[];
}

const FIELD_ORDER: SearchField[] = ["partNo", "name", "specification", "note"];

const FIELD_LABELS: Record<SearchField, string> = {
  partNo: "料号",
  name: "名称",
  specification: "规格",
  note: "备注",
};

const COMPACT_ALNUM_RE = /^[A-Za-z0-9]{3,}$/;
const NUMERIC_RE = /^\d+(\.\d+)?$/;
const UNIT_RE =
  /(Ω|欧|伏|法|亨|赫|ohm|volt|farad|henry|hertz|\d+(\.\d+)?\s*(pf|nf|uf|uh|mh|hz|k|m|r|v|a|w|f|h)\b)/i;

export function splitSearchTerms(query: string): string[] {
  return (query || "")
    .split(/[\s,，、/;；:：]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** 词分类（对齐原版规则兜底：料号优先，其次单位/数值，最后名称） */
function classifyToken(token: string): SearchField | null {
  const lower = token.toLowerCase();
  if (SEARCH_GENERIC_TERMS.has(token) || SEARCH_GENERIC_TERMS.has(lower)) return null;
  if (SEARCH_NOTE_HINT_TERMS.has(token) || SEARCH_NOTE_HINT_TERMS.has(lower)) return "note";

  const compact = token.replace(/[\s\-_./]/g, "");
  if (COMPACT_ALNUM_RE.test(compact) && /\d/.test(compact)) return "partNo";
  if (UNIT_RE.test(token) || NUMERIC_RE.test(token)) return "specification";
  return "name";
}

function categoryTerms(token: string): string[] {
  const lower = token.toLowerCase();
  for (const [label, terms] of COMPONENT_CATEGORY_HINTS) {
    if (terms.some((term) => lower.includes(term))) return [label, ...terms];
  }
  return [];
}

/** 规则解析：把自然语言拆成字段映射（原版 AI 解析的规则兜底版） */
export function buildRuleSearchPlan(query: string): SearchPlan {
  const fieldMap: SearchFieldMap = { partNo: [], name: [], specification: [], note: [] };
  const units: SearchUnit[] = [];
  const keywords: string[] = [];
  const seen = new Set<string>();

  const pushUnit = (token: string, field: SearchField, extraTerms: string[] = []) => {
    if (seen.has(token)) return;
    seen.add(token);
    const terms = [token];
    for (const term of extraTerms) {
      if (!terms.includes(term)) terms.push(term);
    }
    units.push({ token, field, terms });
    keywords.push(token);
    fieldMap[field].push(token);
    for (const term of terms.slice(1)) {
      if (!fieldMap[field].includes(term)) fieldMap[field].push(term);
    }
  };

  for (const token of splitSearchTerms(query)) {
    const field = classifyToken(token);
    if (!field) continue;
    pushUnit(token, field, field === "name" ? categoryTerms(token) : []);
  }

  // 全是通用词（如只输入"元件"）时退回整词
  const fallback = query.trim();
  if (!units.length && fallback) pushUnit(fallback, "name");

  const parts: string[] = [];
  for (const field of FIELD_ORDER) {
    if (fieldMap[field].length) {
      parts.push(`${FIELD_LABELS[field]}: ${fieldMap[field].join(" / ")}`);
    }
  }
  return {
    mode: "rule",
    query: fallback,
    fieldMap,
    units,
    keywords,
    summary: parts.length ? `规则解析 → ${parts.join(" | ")}` : "未提取到有效关键词",
  };
}

function variantsOf(term: string): string[] {
  return expandUnitVariants(term).slice(0, 8);
}

/** 单字段命中率：归一化后子串命中 0.85~1.0，否则用 fuzzysort 模糊分 */
function fieldRatio(text: string, term: string): number {
  const haystack = normalizeMaterialText(text);
  const needle = normalizeMaterialText(term);
  if (!haystack || !needle) return 0;
  if (haystack.includes(needle)) {
    return Math.min(1, 0.85 + Math.min(needle.length / 12, 0.15));
  }
  const result = fuzzysort.single(needle, haystack);
  return result ? result.score : 0;
}

/** 结构化字段的可搜索文本（品牌 / 封装 / 分类 / 型号 / 立创编号 / 参数表） */
function structuredText(component: Component): string {
  return [
    component.mpn,
    component.brand,
    component.packageName,
    component.category,
    component.lcscCode,
    (component.params ?? []).map((param) => `${param.name}=${param.value}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

export function matchComponent(
  component: Component,
  plan: SearchPlan,
  fuzziness: SearchFuzziness,
): MatchInfo {
  const profile = SEARCH_FUZZY_PROFILES[fuzziness];
  const fields: { field: SearchField; text: string }[] = [
    { field: "partNo", text: component.partNo },
    { field: "name", text: component.name },
    { field: "specification", text: [component.specification, structuredText(component)].filter(Boolean).join(" ") },
    { field: "note", text: component.note },
  ];

  const matchedTerms: string[] = [];
  const matchedFields = new Set<SearchField>();
  const fuzzyMatches: FuzzyMatch[] = [];
  let score = 0;
  let hits = 0;

  /** 在全部字段中为该词找最佳命中，返回命中率（0 表示未过软门槛） */
  const evaluate = (
    unit: SearchUnit,
    weight: number,
    hitGate: number,
    softGate: number,
  ): number => {
    let bestRatio = 0;
    let bestField: SearchField = unit.field;
    let bestTerm = unit.token;
    outer: for (const term of unit.terms) {
      for (const variant of variantsOf(term)) {
        for (const { field, text } of fields) {
          const ratio = fieldRatio(text, variant);
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestField = field;
            bestTerm = term;
          }
          if (bestRatio >= 1) break outer;
        }
      }
    }
    if (bestRatio < softGate) return 0;
    score += weight * bestRatio * (bestRatio < hitGate ? 0.6 : 1);
    hits += 1;
    matchedTerms.push(unit.token);
    matchedFields.add(bestField);
    if (bestRatio < profile.highFuzzyGate) {
      fuzzyMatches.push({ term: bestTerm, field: bestField, score: Number(bestRatio.toFixed(2)) });
    }
    return bestRatio;
  };

  for (const unit of plan.units) {
    const primary = evaluate(
      unit,
      SEARCH_FIELD_WEIGHTS[unit.field],
      profile.fieldHit,
      profile.softHit,
    );
    if (!primary) {
      // 关键词兜底：更低门槛 + 较低权重（原版 keyword_* 门限）
      evaluate(unit, 2.5, profile.keywordHit, profile.keywordSoft);
    }
  }

  const coverage = plan.units.length ? hits / plan.units.length : 0;
  const isMatch = score >= profile.scoreGate && coverage >= profile.coverageGate;
  return {
    isMatch,
    score,
    matchedFields: [...matchedFields],
    matchedTerms,
    fuzzyMatches,
    coverage,
  };
}

/** 粗筛（对齐原版 SQL ILIKE 预筛选）：任一词或变体在任一字段子串命中 */
function prefilterMatch(component: Component, plan: SearchPlan): boolean {
  const haystacks = [
    component.partNo,
    component.name,
    component.specification,
    component.note,
    structuredText(component),
  ].map((text) => normalizeMaterialText(text));
  for (const unit of plan.units) {
    for (const term of unit.terms) {
      for (const variant of variantsOf(term)) {
        const needle = normalizeMaterialText(variant);
        if (!needle) continue;
        if (haystacks.some((haystack) => haystack.includes(needle))) return true;
      }
    }
  }
  return false;
}

export function searchInventory(
  data: InventoryData,
  query: string,
  fuzziness: SearchFuzziness,
  minScore = SEARCH_MIN_DISPLAY_SCORE,
): { plan: SearchPlan; rows: SearchResultRow[] } {
  const plan = buildRuleSearchPlan(query);
  if (!query.trim()) return { plan, rows: [] };

  const boxById = new Map(data.boxes.map((box) => [box.id, box]));
  const candidates = data.components
    .filter((component) => component.enabled)
    .filter((component) => prefilterMatch(component, plan))
    .slice(0, SEARCH_MAX_CANDIDATES);

  const rows: SearchResultRow[] = [];
  for (const component of candidates) {
    const info = matchComponent(component, plan, fuzziness);
    if (!info.isMatch || info.score < minScore) continue;
    const box = boxById.get(component.boxId);
    rows.push({
      component,
      boxId: component.boxId,
      slotIndex: component.slotIndex,
      boxName: box?.name ?? `盒子#${component.boxId}`,
      slotCode: box ? slotCodeForBox(box, component.slotIndex) : String(component.slotIndex),
      matchSummary:
        info.matchedFields.map((field) => FIELD_LABELS[field]).join(" / ") || "全文匹配",
      matchedTerms: info.matchedTerms,
      matchScore: Number(info.score.toFixed(1)),
      fuzzyMatches: info.fuzzyMatches,
    });
  }
  rows.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      a.component.partNo.localeCompare(b.component.partNo) ||
      a.component.name.localeCompare(b.component.name),
  );
  return { plan, rows };
}
