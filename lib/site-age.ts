import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { site } from "./site";

dayjs.extend(utc);

/** 以建站日为起点、按 UTC 计算的建站天数（含今天，各时区一致）；未设置建站日则返回 null */
export function siteAgeDays(): number | null {
  if (!site.startDate) return null;
  const days = dayjs.utc().startOf("day").diff(dayjs.utc(site.startDate), "day") + 1;
  return Number.isFinite(days) ? days : null;
}
