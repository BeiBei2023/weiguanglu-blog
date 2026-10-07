import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { publicAiConfig, saveAiConfig } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...publicAiConfig() });
}

/** 保存设置（key / 接口地址 / 模型 / 条数）。key 只在服务器上落盘，不回传给页面。 */
export async function PUT(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { apiKey?: string; endpoint?: string; model?: string; points?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const saved = saveAiConfig(body);
  return NextResponse.json({
    ok: true,
    configured: Boolean(saved.apiKey),
    endpoint: saved.endpoint,
    model: saved.model,
    points: saved.points,
  });
}
