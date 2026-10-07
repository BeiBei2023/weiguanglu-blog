import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readAiReport, readAiReportMarkdown } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** 单条历史解读：默认返回 JSON；`?format=md` 直接下载 Markdown 文件 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  if (new URL(request.url).searchParams.get("format") === "md") {
    const markdown = readAiReportMarkdown(id);
    if (!markdown) {
      return NextResponse.json({ error: "没有这条解读" }, { status: 404 });
    }
    return new NextResponse(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="ai-report-${id}.md"`,
        "cache-control": "no-store",
      },
    });
  }

  const report = readAiReport(id);
  if (!report) {
    return NextResponse.json({ error: "没有这条解读" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, report });
}
