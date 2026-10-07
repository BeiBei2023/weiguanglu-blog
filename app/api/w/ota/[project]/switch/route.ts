import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidProject, switchFirmware } from "@/lib/ota";

export const dynamic = "force-dynamic";

type Params = Promise<{ project: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { project } = await params;
  if (!isValidProject(project)) return NextResponse.json({ error: "非法项目名" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { ts?: unknown } | null;
  const result = switchFirmware(project, String(body?.ts ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
