import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { AiError } from "@/lib/ai";
import { explainHotItem, readAiItemNote } from "@/lib/ai-item";
import { findHotItem } from "@/lib/hot";

export const dynamic = "force-dynamic";

/** 取某条热点的 AI 解说缓存 */
export async function GET(request: Request) {
  if (!(await getSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return NextResponse.json({ ok: true, note: readAiItemNote(id) });
}

/** 生成某条热点的 AI 解说（只有用户在详情页点按钮才会走到这里） */
export async function POST(request: Request) {
  if (!(await getSession(request))) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      url?: string;
      meta?: string;
      summary?: string;
    };
    if (!body.id || !body.title) {
      return NextResponse.json({ ok: false, error: "缺少条目信息，回热点页重新打开" }, { status: 400 });
    }
    // 只对「GitHub 新星」开放（2026-10-07 决定）：别让别的来源绕过前端直接调
    const found = findHotItem(body.id);
    if (!found || found.source.id !== "github") {
      return NextResponse.json({ ok: false, error: "AI 解说只在「GitHub 新星」上开放" }, { status: 400 });
    }
    const note = await explainHotItem({
      id: body.id,
      title: body.title,
      url: body.url ?? "",
      meta: body.meta,
      summary: body.summary,
    });
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof AiError ? error.message : "生成失败，稍后再试" },
      { status: 502 },
    );
  }
}
