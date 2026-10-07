import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  LookupNotFoundError,
  LookupRateLimitError,
  LookupUnsupportedError,
  lookup,
} from "@/lib/inventory/lookup";

export const dynamic = "force-dynamic";

/**
 * 立创元器件识别：GET /api/w/inventory/lookup?q=<型号|立创编号|商品链接>
 */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "请输入型号、立创编号或商品链接" }, { status: 400 });
  }
  try {
    const result = await lookup(query);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "识别失败，请稍后重试";
    const status =
      error instanceof LookupUnsupportedError
        ? 422
        : error instanceof LookupNotFoundError
          ? 404
          : error instanceof LookupRateLimitError
            ? 429
            : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
