/**
 * 轻量滑动窗口限流（进程内；单实例部署够用）。
 * 用途：公开只读接口（天气）与计数接口（浏览量）的防刷。
 */
const store = new Map<string, number[]>();

/** 取客户端 IP（经反代时看 x-forwarded-for） */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** 超过 max 次/窗口 时返回 true（本次也计入窗口） */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    store.set(key, list);
    return true;
  }
  list.push(now);
  store.set(key, list);
  // 顺手清理过期键，避免长期运行内存增长
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.length === 0 || now - v[v.length - 1] > windowMs) store.delete(k);
    }
  }
  return false;
}
