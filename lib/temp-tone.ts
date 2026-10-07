/**
 * 温度的纯展示逻辑 —— 不含 `node:fs`，客户端组件可以直接引用。
 *
 * 真正读传感器（`readTemps()`）在 `lib/temps.ts`，那个只能在服务端跑。
 */

/** 达到这个温度就在界面与告警里标黄（coretemp 自带的 high 也是 80℃） */
export const TEMP_WARN = 80;
/** 达到这个温度算危险，标红 */
export const TEMP_DANGER = 90;

export type TempTone = "ok" | "warn" | "danger";

export function tempTone(value: number | null | undefined): TempTone {
  if (typeof value !== "number") return "ok";
  if (value >= TEMP_DANGER) return "danger";
  if (value >= TEMP_WARN) return "warn";
  return "ok";
}
