import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listAiReports } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** 历史解读列表（只读元信息，正文走 /api/w/ai/reports/<id>） */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, reports: listAiReports() });
}
