import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deletePost, parseInput, updatePost } from "@/lib/content/admin";
import { pingSearchEngines } from "@/lib/search-ping";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function PUT(request: Request, { params }: { params: Params }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  const input = parseInput(body);
  if (!input.title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });

  const expectedVersion = typeof body.version === "string" ? body.version : undefined;
  const force = body.force === true;
  const result = updatePost(slug, input, expectedVersion, force);

  if ("conflict" in result) {
    return NextResponse.json({ conflict: true, version: result.version }, { status: 409 });
  }
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // 更新后主动推送（IndexNow + 百度；失败不影响保存）
  pingSearchEngines([`/posts/${slug}`, "/", "/archive"]);

  return NextResponse.json({ ok: true, version: result.version });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { slug } = await params;
  const result = deletePost(slug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
