import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { AiError, runZenChat } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * 用**当前已保存**的设置真发一次最小请求，确认 key / 接口地址 / 模型三样都对。
 * （页面上的「保存并测试连接」会先 PUT 保存，再打这个接口。）
 */
export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  try {
    const { text, model } = await runZenChat([
      { role: "system", content: "你是连接测试助手，只回一句很短的中文，不要展开。" },
      { role: "user", content: "回一句：连接正常。" },
    ]);
    return NextResponse.json({ ok: true, model, reply: text.slice(0, 200) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof AiError ? error.message : "测试失败，稍后再试",
    });
  }
}
