"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";

/** 阅读量：服务端传入初始值；同一浏览器会话内每篇只上报一次，挂载后刷新为最新值 */
export function ViewCounter({ slug, initial }: { slug: string; initial: number }) {
  const [count, setCount] = useState(initial);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    const storageKey = `wgl-viewed:${slug}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "1";
      if (!seen) sessionStorage.setItem(storageKey, "1");
    } catch {
      // 隐私模式等禁用 storage：退化为每次都上报（服务端还有 5s 节流）
    }
    if (seen) return;

    let cancelled = false;
    fetch(`/api/views/${slug}`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { count?: number } | null) => {
        if (!cancelled && data && typeof data.count === "number") setCount(data.count);
      })
      .catch(() => {
        // 计数失败不影响阅读
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <span className="inline-flex items-center gap-1" title="阅读量">
      <Eye className="h-3.5 w-3.5" />
      {count} 次阅读
    </span>
  );
}
