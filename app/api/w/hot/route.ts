import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { refreshHot } from "@/lib/hot";

export const dynamic = "force-dynamic";

/** 手动刷新热点（绕过 1 小时 TTL） */
export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  try {
    return NextResponse.json(await refreshHot({ force: true }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "刷新失败" },
      { status: 502 },
    );
  }
}
