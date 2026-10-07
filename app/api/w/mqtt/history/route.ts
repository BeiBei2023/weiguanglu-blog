import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { mqttHistory, mqttHistoryTopics } from "@/lib/mqtt/history";

export const dynamic = "force-dynamic";

/** 数值历史：不传 topic 返回主题列表，传了返回该主题的点 */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const topic = new URL(request.url).searchParams.get("topic");
  if (!topic) return NextResponse.json({ topics: mqttHistoryTopics() });
  return NextResponse.json({ topic, points: mqttHistory(topic) });
}
