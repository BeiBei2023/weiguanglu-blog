import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteProject, isValidProject } from "@/lib/ota";

export const dynamic = "force-dynamic";

type Params = Promise<{ project: string }>;

export async function DELETE(request: Request, { params }: { params: Params }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { project } = await params;
  if (!isValidProject(project)) return NextResponse.json({ error: "非法项目名" }, { status: 400 });

  const ok = deleteProject(project);
  if (!ok) return NextResponse.json({ error: "删除失败" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
