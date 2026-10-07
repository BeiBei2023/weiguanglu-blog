import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { sysInfo } from "@/lib/sysinfo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sysInfo());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "采集失败" },
      { status: 500 },
    );
  }
}
