"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server";
import { downloadGeoipDatabase } from "@/lib/geoip";
import { clearViewLogs, trimViewLogs, writeViewsSettings } from "@/lib/views-log";

export interface ViewsActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
}

async function guard(): Promise<ViewsActionResult | null> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };
  return null;
}

function flag(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function revalidate(): void {
  revalidatePath("/w/views");
}

export async function saveViewsSettingsAction(
  _prev: ViewsActionResult | null,
  formData: FormData,
): Promise<ViewsActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const raw = Number(formData.get("maxEntries"));
  const next = writeViewsSettings({
    maxEntries: Number.isFinite(raw) ? raw : undefined,
    maskIp: flag(formData, "maskIp"),
    recordUa: flag(formData, "recordUa"),
    recordRef: flag(formData, "recordRef"),
    recordBots: flag(formData, "recordBots"),
  });
  trimViewLogs();
  revalidate();
  return {
    ok: true,
    notice: `已保存：最多保留 ${next.maxEntries} 条流水${next.maskIp ? " · IP 打码显示" : ""}${
      next.recordUa ? "" : " · 不记录浏览器"
    }${next.recordRef ? "" : " · 不记录来源"}${next.recordBots ? "" : " · 不记录 robots"}`,
  };
}

export async function clearViewLogsAction(): Promise<ViewsActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  clearViewLogs();
  revalidate();
  return { ok: true, notice: "流水已清空（阅读量总数不受影响）" };
}

export async function updateGeoipAction(): Promise<ViewsActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  const result = await downloadGeoipDatabase();
  revalidate();
  if (!result.ok) return { ok: false, error: result.error ?? "地区库下载失败" };
  const mb = ((result.bytes ?? 0) / 1024 / 1024).toFixed(1);
  return { ok: true, notice: `地区库已更新（${mb} MB），新的访问会显示归属地` };
}
