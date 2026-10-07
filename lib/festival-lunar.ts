/**
 * 农历转换（1900–2100），无依赖实现
 *
 * 原理：用一张「每年农历正月初一对应的公历日期」+「每年农历闰月月份」表，
 * 把农历日期换算成公历日期。数据来自通用的 lunarInfo 数据表（与 solarlunar /
 * lunar-javascript 等库同源），这里只保留节日计算需要的最小部分。
 *
 * 用途：博客的节日氛围（lib/festival.ts）要按农历算春节 / 端午 / 中秋 / 生日。
 */

/** 1900–2100 年：每年一个编码，位含义见 lunarToSolar */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];

const MIN_YEAR = 1900;

/** 公历日期 → 当天的天数序号（可减，用于算差值） */
function toDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/** 该农历年闰几月（0 = 无闰月） */
function leapMonth(year: number): number {
  return LUNAR_INFO[year - MIN_YEAR] & 0xf;
}

/** 该农历年闰月天数（无闰月返回 0） */
function leapDays(year: number): number {
  if (!leapMonth(year)) return 0;
  return (LUNAR_INFO[year - MIN_YEAR] & 0x10000) ? 30 : 29;
}

/** 该农历年第 month 月的天数（29 / 30） */
function monthDays(year: number, month: number): number {
  return LUNAR_INFO[year - MIN_YEAR] & (0x10000 >> month) ? 30 : 29;
}

/** 该农历年总天数 */
function yearDays(year: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += LUNAR_INFO[year - MIN_YEAR] & i ? 1 : 0;
  return sum + leapDays(year);
}

/** 农历年 year 正月初一对应的公历日期（本地时区的 Date，只取年月日） */
function lunarNewYear(year: number): Date {
  // 1900 年正月初一 = 1900-01-31
  let offset = 0;
  for (let y = MIN_YEAR; y < year; y += 1) offset += yearDays(y);
  const base = Date.UTC(1900, 0, 31) + offset * 86400000;
  const d = new Date(base);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * 农历（year, month, day）→ 公历 Date（本地时区 0 点）
 * @param isLeap 是否闰月
 */
export function lunarToSolar(year: number, month: number, day: number, isLeap = false): Date | null {
  if (year < MIN_YEAR || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 30) return null;

  let offset = 0;
  for (let m = 1; m < month; m += 1) {
    offset += monthDays(year, m);
    // 闰月排在对应月份之后
    if (leapMonth(year) === m) offset += leapDays(year);
  }
  if (isLeap) {
    if (leapMonth(year) !== month) return null;
    offset += monthDays(year, month);
  }
  offset += day - 1;

  const start = lunarNewYear(year);
  const d = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) + offset * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** 公历日期 → 农历 { year, month, day, isLeap }（只保留日期部分） */
export function solarToLunar(date: Date): { year: number; month: number; day: number; isLeap: boolean } {
  const dayNumber = toDayNumber(date);
  let year = date.getFullYear();
  // 先按公历年份对齐农历年（春节前后要退一年）
  const ny = lunarNewYear(year);
  if (toDayNumber(ny) > dayNumber) year -= 1;

  let offset = dayNumber - toDayNumber(lunarNewYear(year));
  const leap = leapMonth(year);

  let month = 1;
  let isLeap = false;
  for (;;) {
    const days = isLeap ? leapDays(year) : monthDays(year, month);
    if (offset < days) break;
    offset -= days;
    if (isLeap) {
      isLeap = false;
      month += 1;
    } else if (leap === month) {
      isLeap = true;
    } else {
      month += 1;
    }
    if (month > 12) {
      year += 1;
      month = 1;
      isLeap = false;
    }
  }

  return { year, month, day: offset + 1, isLeap };
}

/** 农历显示用文本，如「七月初七」「腊月廿三」 */
const MONTH_NAMES = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const DAY_NAMES = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

export function lunarLabel(month: number, day: number, isLeap = false): string {
  const m = `${isLeap ? "闰" : ""}${MONTH_NAMES[month - 1] ?? month}月`;
  return `${m}${DAY_NAMES[day - 1] ?? day}`;
}
