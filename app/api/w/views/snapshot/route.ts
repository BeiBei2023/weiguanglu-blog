import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { buildViewsSnapshot } from "@/lib/views-stats";

export const dynamic = "force-dynamic";

/** 阅读统计面板快照（总览 + 热门榜 + 最近流水） */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(raw) ? Math.min(180, Math.max(7, Math.floor(raw))) : 30;
  return NextResponse.json(await buildViewsSnapshot({ days }));
}
