import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "wgl_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 天（秒）

const ALG = "HS256";

export interface SessionPayload {
  /** 用户名 */
  u: string;
  /** 过期时间（epoch 秒） */
  exp: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 未配置");
  return new TextEncoder().encode(secret);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function createSessionToken(
  username: string,
  maxAge: number = SESSION_MAX_AGE,
): Promise<string> {
  return new SignJWT({ u: username })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(nowSeconds() + maxAge)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (typeof payload.u !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < nowSeconds()) return null;
    return { u: payload.u, exp: payload.exp };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** 从请求中解析登录态；未登录/失效返回 null */
export async function getSession(request: Request): Promise<SessionPayload | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token);
}
