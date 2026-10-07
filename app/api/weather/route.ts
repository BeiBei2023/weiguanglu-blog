import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { publicWeatherSnapshot } from "@/lib/weather";

export const dynamic = "force-dynamic";

/**
 * 天气（给侧栏挂件用）：公开只读，服务端已缓存，浏览器随便刷不会打爆心知配额；
 * 另加一层按 IP 限流（每分钟 120 次）防脚本刷。
 * `?force=1` 只有登录用户能用（跳过缓存）。
 */
export async function GET(request: Request) {
  // 防刷：同一 IP 每分钟最多 120 次（侧栏挂件的正常浏览远达不到）
  if (isRateLimited(`weather|${clientIp(request)}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  const url = new URL(request.url);
  const wantsForce = url.searchParams.get("force") === "1";
  const session = wantsForce ? await getServerSession() : null;
  const snapshot = await publicWeatherSnapshot(Boolean(session) && wantsForce);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
