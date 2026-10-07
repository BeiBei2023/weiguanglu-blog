"use client";

import { useEffect, useRef } from "react";

/**
 * 只在标签页可见时按 interval 跑回调；从后台切回来时立刻补跑一次。
 *
 * 用来替代裸 `setInterval`：工作站的状态页（10s）、MQTT 地图（5s）等
 * 之前不管页面在不在前台都一直请求，后台常驻会白白刷。
 */
export function useVisibleInterval(callback: () => void, intervalMs: number | null) {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") saved.current();
    }, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
