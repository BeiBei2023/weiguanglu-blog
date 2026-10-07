import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAllPosts } from "@/lib/content";
import { isRateLimited } from "@/lib/rate-limit";
import { getViews, incrementViews } from "@/lib/views";
import { appendViewLog, isBotUa, visitorId } from "@/lib/views-log";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** 同一 IP + 同一文章在 5 秒内只计一次（防刷新/脚本刷量） */
const COOLDOWN_MS = 5000;
const recent = new Map<string, number>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function refererHost(request: Request): string {
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    return new URL(referer).host;
  } catch {
    return "";
  }
}

function tooSoon(key: string): boolean {
  const now = Date.now();
  if (recent.size > 5000) {
    for (const [k, t] of recent) {
      if (now - t > COOLDOWN_MS) recent.delete(k);
    }
  }
  const last = recent.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) return true;
  recent.set(key, now);
  return false;
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { slug } = await params;
  const known = getAllPosts().some((post) => post.slug === slug);
  if (!known) return NextResponse.json({ error: "未知文章" }, { status: 404 });

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const session = await getSession(request);

  const log = (): void => {
    appendViewLog({
      t: new Date().toISOString(),
      slug,
      ip,
      ua,
      ref: refererHost(request),
      vid: visitorId(ip, ua),
      bot: isBotUa(ua),
      self: false,
    });
  };

  // 自己（带后台登录态）浏览：不记流水、不计阅读量（只回当前数）
  if (session) {
    return NextResponse.json({ count: getViews(slug), self: true });
  }

  // 防刷：同一 IP 10 分钟内最多计 30 次（正常读者远达不到；超限只回当前数、不再累加）
  if (isRateLimited(`views|${ip}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ count: getViews(slug), throttled: true });
  }

  if (tooSoon(`${ip}|${slug}`)) {
    return NextResponse.json({ count: getViews(slug), throttled: true });
  }

  try {
    const count = await incrementViews(slug);
    log();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: "计数失败" }, { status: 400 });
  }
}
