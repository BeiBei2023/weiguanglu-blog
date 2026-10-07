import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clearQueue, createQueue, readQueue, stepQueue } from "@/lib/inventory/lookup-queue";

export const dynamic = "force-dynamic";

/** 批量识别队列：GET 查看进度；POST { action: "create" | "step" | "clear" } */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ queue: readQueue() });
}

export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; queries?: unknown }
    | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "create") {
    const queries = Array.isArray(body?.queries)
      ? body.queries.filter((item): item is string => typeof item === "string")
      : [];
    if (!queries.length) {
      return NextResponse.json({ error: "请先粘贴要识别的型号或编号（一行一个）" }, { status: 400 });
    }
    return NextResponse.json({ queue: createQueue(queries) });
  }
  if (action === "step") {
    return NextResponse.json({ queue: await stepQueue() });
  }
  if (action === "clear") {
    return NextResponse.json({ queue: clearQueue() });
  }
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
