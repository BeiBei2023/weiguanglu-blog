/**
 * 节日氛围：默认节日表与类型定义（**不碰 node API**，客户端组件也能引）
 *
 * 真正的节日数据存在 data/festivals.json（工作台 /w/festivals 可改），
 * 这里的 DEFAULT_FESTIVALS 只是「首次运行的种子」和后台下拉框的选项来源。
 */

/** 粒子效果类型（客户端据此生成 tsParticles 配置） */
export type FestivalEffect = "emoji-fall" | "snow" | "confetti" | "lantern" | "spark" | "petal" | "none";

/** 节日类别：法定（放假）/ 小节日 / 个人日子 */
export type FestivalKind = "statutory" | "minor" | "personal";

/** 年度规则：按公历或农历的「月-日」定位（没有固定区间时用它每年算） */
export interface FestivalRule {
  type: "solar" | "lunar";
  month: number;
  day: number;
}

/** 一条节日 */
export interface FestivalEntry {
  id: string;
  name: string;
  /** 页脚/横幅上的祝福语，如「国庆快乐」 */
  greeting: string;
  emoji: string;
  /** 主题色（光晕、横幅、图标都用它） */
  color: string;
  effect: FestivalEffect;
  kind: FestivalKind;
  enabled: boolean;
  /** 固定显示区间（含首尾，YYYY-MM-DD）；由 holiday-cn 同步写入或手工指定 */
  start?: string;
  end?: string;
  /** 年度规则（没同步到固定区间时按它每年算） */
  rule?: FestivalRule;
  /** 规则命中后持续几天（默认 1） */
  days?: number;
  note?: string;
  /** 数据来源：手工维护 / 国务院放假安排（holiday-cn） */
  source?: "manual" | "holiday-cn";
}

export const FESTIVAL_EFFECTS: { id: FestivalEffect; label: string }[] = [
  { id: "emoji-fall", label: "节日图标飘落" },
  { id: "confetti", label: "彩带纸屑" },
  { id: "snow", label: "飘雪" },
  { id: "lantern", label: "花灯上升" },
  { id: "petal", label: "花瓣落叶" },
  { id: "spark", label: "星光闪烁" },
  { id: "none", label: "不放粒子" },
];

export const FESTIVAL_KINDS: { id: FestivalKind; label: string }[] = [
  { id: "statutory", label: "法定节日" },
  { id: "minor", label: "小节日" },
  { id: "personal", label: "个人日子" },
];

export const DEFAULT_FESTIVALS: FestivalEntry[] = [
  {
    id: "new-year",
    name: "元旦",
    greeting: "元旦快乐",
    emoji: "🎊",
    color: "#e0483c",
    effect: "confetti",
    kind: "statutory",
    enabled: true,
    rule: { type: "solar", month: 1, day: 1 },
    days: 1,
  },
  {
    id: "spring-festival",
    name: "春节",
    greeting: "新春快乐",
    emoji: "🧧",
    color: "#d8382f",
    effect: "emoji-fall",
    kind: "statutory",
    enabled: true,
    rule: { type: "lunar", month: 1, day: 1 },
    days: 7,
    note: "放假区间以国务院安排为准，可在工作台点「同步放假安排」",
  },
  {
    id: "lantern",
    name: "元宵节",
    greeting: "元宵快乐",
    emoji: "🏮",
    color: "#e0862f",
    effect: "lantern",
    kind: "minor",
    enabled: true,
    rule: { type: "lunar", month: 1, day: 15 },
    days: 1,
  },
  {
    id: "qingming",
    name: "清明节",
    greeting: "清明安康",
    emoji: "🌿",
    color: "#5f8f6a",
    effect: "petal",
    kind: "statutory",
    enabled: true,
    rule: { type: "solar", month: 4, day: 4 },
    days: 3,
  },
  {
    id: "labour",
    name: "劳动节",
    greeting: "劳动节快乐",
    emoji: "🛠️",
    color: "#c2552f",
    effect: "confetti",
    kind: "statutory",
    enabled: true,
    rule: { type: "solar", month: 5, day: 1 },
    days: 5,
  },
  {
    id: "youth",
    name: "青年节",
    greeting: "青年节快乐",
    emoji: "🌱",
    color: "#4b8f6f",
    effect: "petal",
    kind: "minor",
    enabled: true,
    rule: { type: "solar", month: 5, day: 4 },
    days: 1,
  },
  {
    id: "dragon-boat",
    name: "端午节",
    greeting: "端午安康",
    emoji: "🐉",
    color: "#3f7d5c",
    effect: "emoji-fall",
    kind: "statutory",
    enabled: true,
    rule: { type: "lunar", month: 5, day: 5 },
    days: 3,
  },
  {
    id: "children",
    name: "儿童节",
    greeting: "儿童节快乐",
    emoji: "🎈",
    color: "#e26f9c",
    effect: "emoji-fall",
    kind: "minor",
    enabled: true,
    rule: { type: "solar", month: 6, day: 1 },
    days: 1,
  },
  {
    id: "qixi",
    name: "七夕",
    greeting: "七夕快乐",
    emoji: "💫",
    color: "#b06fa8",
    effect: "petal",
    kind: "minor",
    enabled: true,
    rule: { type: "lunar", month: 7, day: 7 },
    days: 1,
  },
  {
    id: "mid-autumn",
    name: "中秋节",
    greeting: "中秋快乐",
    emoji: "🌕",
    color: "#d9a441",
    effect: "lantern",
    kind: "statutory",
    enabled: true,
    rule: { type: "lunar", month: 8, day: 15 },
    days: 3,
  },
  {
    id: "teacher",
    name: "教师节",
    greeting: "教师节快乐",
    emoji: "💐",
    color: "#c9743f",
    effect: "petal",
    kind: "minor",
    enabled: true,
    rule: { type: "solar", month: 9, day: 10 },
    days: 1,
  },
  {
    id: "national",
    name: "国庆节",
    greeting: "国庆快乐",
    emoji: "🇨🇳",
    color: "#cf2f2a",
    effect: "confetti",
    kind: "statutory",
    enabled: true,
    rule: { type: "solar", month: 10, day: 1 },
    days: 7,
  },
  {
    id: "chongyang",
    name: "重阳节",
    greeting: "重阳安康",
    emoji: "🍂",
    color: "#b3703a",
    effect: "petal",
    kind: "minor",
    enabled: true,
    rule: { type: "lunar", month: 9, day: 9 },
    days: 1,
  },
  {
    id: "programmer",
    name: "程序员节",
    greeting: "程序员节快乐",
    emoji: "💻",
    color: "#4a7fd4",
    effect: "spark",
    kind: "minor",
    enabled: true,
    rule: { type: "solar", month: 10, day: 24 },
    days: 1,
  },
  {
    id: "singles-day",
    name: "双十一",
    greeting: "理性剁手",
    emoji: "🛒",
    color: "#e0555a",
    effect: "confetti",
    kind: "minor",
    enabled: true,
    rule: { type: "solar", month: 11, day: 11 },
    days: 1,
  },
  {
    id: "laba",
    name: "腊八节",
    greeting: "腊八安康",
    emoji: "🥣",
    color: "#a9713f",
    effect: "emoji-fall",
    kind: "minor",
    enabled: true,
    rule: { type: "lunar", month: 12, day: 8 },
    days: 1,
  },
  {
    id: "birthday",
    name: "生日",
    greeting: "生日快乐",
    emoji: "🎂",
    color: "#e0913c",
    effect: "emoji-fall",
    kind: "personal",
    enabled: true,
    rule: { type: "lunar", month: 7, day: 27 },
    days: 1,
    note: "农历七月廿七（站长生日）",
  },
  {
    id: "site-anniversary",
    name: "建站周年",
    greeting: "生日快乐",
    emoji: "✨",
    color: "#e07a52",
    effect: "spark",
    kind: "personal",
    enabled: true,
    rule: { type: "solar", month: 9, day: 27 },
    days: 1,
    note: "域名注册日 2025-09-27",
  },
];
