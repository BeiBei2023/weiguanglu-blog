import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { normalizeViewQuery, queryViewEntries } from "@/lib/views-stats";

export const dynamic = "force-dynamic";

/** 访客流水查询（支持时间范围 / 文章 / 关键字 / 是否含机器人 / 分页） */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const query = normalizeViewQuery(new URL(request.url).searchParams);
  const result = await queryViewEntries(query);
  return NextResponse.json({ ...result, query });
}
