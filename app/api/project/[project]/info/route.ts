import { NextResponse } from "next/server";
import { getActiveInfo, isOtaAuthorized, isValidProject, otaUnauthorized } from "@/lib/ota";

export const dynamic = "force-dynamic";

type Params = Promise<{ project: string }>;

/** 兼容旧版 info 接口 */
export async function GET(request: Request, { params }: { params: Params }) {
  if (!isOtaAuthorized(request)) return otaUnauthorized();

  const { project } = await params;
  if (!isValidProject(project)) {
    return NextResponse.json({ error: "非法项目名" }, { status: 400 });
  }
  const info = getActiveInfo(project);
  if (!info) return NextResponse.json({ available: false }, { status: 404 });
  return NextResponse.json({ available: true, ...info });
}
