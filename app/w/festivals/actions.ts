"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server";
import { type FestivalEntry, DEFAULT_FESTIVALS } from "@/lib/festival-defaults";
import { readFestivals, writeFestivals } from "@/lib/festival";
import { syncHolidays } from "@/lib/holiday-cn";
import { saveSiteConfig } from "@/lib/site-config";

export interface FestivalActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
}

async function guard(): Promise<FestivalActionResult | null> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };
  return null;
}

/** 改动后刷新后台页与全站（节日横幅/粒子在根布局里） */
function revalidate() {
  revalidatePath("/w/festivals");
  revalidatePath("/", "layout");
}

/** 新增或按 id 覆盖一条节日 */
export async function saveFestivalAction(input: FestivalEntry): Promise<FestivalActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!input?.id) return { ok: false, error: "缺少节日 id" };

  const store = readFestivals();
  const exists = store.entries.some((item) => item.id === input.id);
  const next = exists
    ? store.entries.map((item) => (item.id === input.id ? input : item))
    : [...store.entries, input];
  writeFestivals(next, store.year);
  revalidate();
  return { ok: true, notice: exists ? `已保存「${input.name}」` : `已新增「${input.name}」` };
}

/** 删除一条节日（id 为内置 id 时也允许删，删完可以用「恢复默认」找回来） */
export async function deleteFestivalAction(id: string): Promise<FestivalActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const store = readFestivals();
  const target = store.entries.find((item) => item.id === id);
  if (!target) return { ok: false, error: "没找到这条节日" };
  writeFestivals(
    store.entries.filter((item) => item.id !== id),
    store.year,
  );
  revalidate();
  return { ok: true, notice: `已删除「${target.name}」` };
}

/** 启用 / 停用（停用后当天不再触发横幅与粒子） */
export async function toggleFestivalAction(
  id: string,
  enabled: boolean,
): Promise<FestivalActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const store = readFestivals();
  const target = store.entries.find((item) => item.id === id);
  if (!target) return { ok: false, error: "没找到这条节日" };
  writeFestivals(
    store.entries.map((item) => (item.id === id ? { ...item, enabled } : item)),
    store.year,
  );
  revalidate();
  return { ok: true, notice: `已${enabled ? "启用" : "停用"}「${target.name}」` };
}

/** 同步某年的国务院放假安排（把起止日期写回条目） */
export async function syncHolidaysAction(year?: number): Promise<FestivalActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const result = await syncHolidays(year ?? new Date().getFullYear());
  revalidate();
  if (!result.ok) {
    return { ok: false, error: result.error ?? "同步失败（网络不通？稍后再试）" };
  }
  const list = result.updated.map((item) => item.name).join("、");
  return {
    ok: true,
    notice:
      `已同步 ${result.year} 年放假安排（来源：${result.source === "network" ? "官方数据" : "本地缓存"}）` +
      (list ? `：${list}` : "，没有匹配到节日"),
  };
}

/** 恢复内置的 18 条默认节日（会丢掉手工改动） */
export async function resetFestivalsAction(): Promise<FestivalActionResult> {
  const denied = await guard();
  if (denied) return denied;
  writeFestivals(DEFAULT_FESTIVALS.map((item) => ({ ...item })));
  revalidate();
  return { ok: true, notice: "已恢复内置默认节日" };
}

/** 预览：把站点设置里的 festival 固定成某个 id（传 null = 恢复自动） */
export async function setPreviewAction(id: string | null): Promise<FestivalActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const store = readFestivals();
  saveSiteConfig({ festival: id ?? "auto" });
  revalidate();
  if (!id) return { ok: true, notice: "已恢复「自动」（按日期识别）" };
  const target = store.entries.find((item) => item.id === id);
  return { ok: true, notice: `正在固定展示「${target?.name ?? id}」（仅预览用，看完记得改回自动）` };
}
