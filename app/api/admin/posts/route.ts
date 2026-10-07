import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createPost, parseInput } from "@/lib/content/admin";
import { pingSearchEngines } from "@/lib/search-ping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  const slug = String(body.slug ?? "").trim();
  const input = parseInput(body);
  if (!input.title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });

  const result = createPost(slug, input);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // 主动推送：让搜索引擎尽快来收（IndexNow + 百度；失败不影响发布）
  pingSearchEngines([`/posts/${slug}`, "/", "/archive"]);

  return NextResponse.json({ ok: true, slug, version: result.version });
}
