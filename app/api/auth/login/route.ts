import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";
import {
  isLocked,
  recordFailure,
  remainingLockSeconds,
  resetFailures,
} from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function POST(request: Request) {
  const ip = clientIp(request);

  if (isLocked(ip)) {
    return NextResponse.json(
      { error: `尝试过于频繁，请 ${remainingLockSeconds(ip)} 秒后再试` },
      { status: 429 },
    );
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // 无请求体按空处理
  }

  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  const expectedUser = process.env.ADMIN_USERNAME ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "";

  const ok =
    expectedUser.length > 0 &&
    expectedPass.length > 0 &&
    timingSafeEqual(username, expectedUser) &&
    timingSafeEqual(password, expectedPass);

  if (!ok) {
    recordFailure(ip);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  resetFailures(ip);
  const token = await createSessionToken(username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
