import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidProject, saveFirmware } from "@/lib/ota";

export const dynamic = "force-dynamic";

type Params = Promise<{ project: string }>;

const MAX_BYTES = 32 * 1024 * 1024; // 32 MB

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { project } = await params;
  if (!isValidProject(project)) return NextResponse.json({ error: "非法项目名" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  const file = form.get("firmware");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "未选择固件文件" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".bin")) {
    return NextResponse.json({ error: "只支持 .bin 固件" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "固件过大（上限 32MB）" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const info = saveFirmware(project, buf, {
    customVersion: String(form.get("customVersion") ?? ""),
    notes: String(form.get("notes") ?? ""),
    originalName: file.name,
  });

  return NextResponse.json({ ok: true, info });
}
