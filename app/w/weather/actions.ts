"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server";
import {
  publicWeatherSnapshot,
  readWeatherConfig,
  searchLocation,
  writeWeatherConfig,
  type LocationHit,
  type WeatherConfig,
  type WeatherSnapshot,
} from "@/lib/weather";

export interface WeatherActionResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  notice?: string;
  hits?: LocationHit[];
  snapshot?: WeatherSnapshot & { configured: boolean };
}

async function guard(): Promise<WeatherActionResult | null> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };
  return null;
}

function revalidate() {
  revalidatePath("/w/weather");
  revalidatePath("/", "layout");
}

/** 保存配置（只传变化了的字段） */
export async function saveWeatherConfigAction(
  input: Partial<WeatherConfig>,
): Promise<WeatherActionResult> {
  const denied = await guard();
  if (denied) return denied;
  try {
    writeWeatherConfig(input);
    revalidate();
    return { ok: true, notice: "已保存", snapshot: await publicWeatherSnapshot(true) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 城市搜索（拿心知的地点 ID）。
 * `key` 可选：传上「配置卡里当前输入的私钥」，这样还没保存也能搜。
 */
export async function searchLocationAction(keyword: string, key?: string): Promise<WeatherActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const q = keyword.trim();
  if (!q) return { ok: false, error: "请输入城市名（中文或拼音都行）" };
  const typedKey = (key ?? "").trim();
  const result = await searchLocation(q, typedKey ? { ...readWeatherConfig(), key: typedKey } : undefined);
  if (!result.ok) return { ok: false, error: result.error ?? "搜索失败" };
  if (!result.hits.length) {
    return { ok: false, notice: "没搜到这个城市，换个写法试试（比如 重庆 / chongqing）" };
  }
  return { ok: true, hits: result.hits, notice: `找到 ${result.hits.length} 个地点` };
}

/** 强制刷新一次（同时用来「测试连接」） */
export async function refreshWeatherAction(): Promise<WeatherActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const snapshot = await publicWeatherSnapshot(true);
  if (!snapshot.ok) {
    return { ok: false, error: snapshot.error, errorCode: snapshot.errorCode, snapshot };
  }
  return { ok: true, notice: "已刷新", snapshot };
}
