"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 数字进位：首屏把「257 条」「26%」这类读数从上一个值数到目标值。
 *
 * - 服务端先渲染真值（不闪 0，无 JS 也正确），客户端 hydration 后才补动画；
 * - 只解析开头的数字，后面的单位原样保留（「113 条」→ 113 在动，「 条」不动）；
 * - 数值变化时从当前显示值继续数（刷新后也是平滑进位）；
 * - 「减少动态效果」下完全不动。
 */
export function CountUp({ text, duration = 720 }: { text: string; duration?: number }) {
  const match = /^(\d+)([\s\S]*)$/.exec(text);
  const target = match ? Number(match[1]) : null;
  const suffix = match ? match[2] : "";
  const [display, setDisplay] = useState<number | null>(null);
  const shown = useRef(0);

  useEffect(() => {
    if (target === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = shown.current;
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
      shown.current = value;
      setDisplay(value);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  if (target === null) return <>{text}</>;
  return (
    <>
      {display ?? target}
      {suffix}
    </>
  );
}
