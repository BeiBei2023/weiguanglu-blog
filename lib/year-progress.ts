export interface YearProgress {
  year: number;
  /** 已过百分比 0–100 */
  pct: number;
  /** 今年的第几天（含今天） */
  dayOfYear: number;
  /** 今年总天数 */
  totalDays: number;
}

/** 计算今年进度（按 UTC，各时区一致） */
export function yearProgress(now: number = Date.now()): YearProgress {
  const year = new Date(now).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const elapsed = Math.min(Math.max(now - start, 0), end - start);
  return {
    year,
    pct: (elapsed / (end - start)) * 100,
    dayOfYear: Math.floor(elapsed / 86400000) + 1,
    totalDays: Math.round((end - start) / 86400000),
  };
}
