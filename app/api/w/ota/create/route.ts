import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createProject, isValidProject, listProjects } from "@/lib/ota";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = String(body?.name ?? "").trim();
  if (!isValidProject(name)) {
    return NextResponse.json(
      { error: "项目名只能是 1–64 位字母/数字/中划线/下划线" },
      { status: 400 },
    );
  }
  if (listProjects().includes(name)) {
    return NextResponse.json({ error: "项目已存在" }, { status: 409 });
  }
  createProject(name);
  return NextResponse.json({ ok: true, projects: listProjects() });
}
