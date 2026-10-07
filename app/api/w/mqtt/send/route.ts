import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { publishFromSite } from "@/lib/mqtt/broker";

export const dynamic = "force-dynamic";

/** 工作台向设备下发消息（页面用 fetch 调用，便于发送后自动关弹窗/Toast） */
export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsed = z
    .object({
      topic: z.string().trim().min(1, "请填主题").max(400),
      payload: z.string().min(1, "请填消息内容").max(16 * 1024, "载荷过大（上限 16KB）"),
      qos: z.union([z.literal(0), z.literal(1)]).optional(),
      retain: z.boolean().optional(),
    })
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入不合法" },
      { status: 400 },
    );
  }

  const result = publishFromSite(parsed.data.topic, parsed.data.payload, {
    qos: (parsed.data.qos ?? 1) as 0 | 1,
    retain: parsed.data.retain,
  });
  if (!result.ok) return NextResponse.json({ error: result.error ?? "发送失败" }, { status: 400 });
  return NextResponse.json({ ok: true, topic: parsed.data.topic });
}
