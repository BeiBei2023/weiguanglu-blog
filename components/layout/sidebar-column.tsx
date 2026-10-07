"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** 与导航胶囊下沿对齐（原 sticky top-24 = 6rem） */
const BASE_TOP_OFFSET = 96;

/**
 * 顶部还有别的条（节日横幅等）时，侧栏要往下让位。
 * 横幅挂在 `#wgl-top-banner` 上，这里读它的高度（含 margin），
 * 变化时（关闭横幅 / 换节日 / 缩放）跟着调整。
 */
function measureBannerOffset(): number {
  const el = document.getElementById("wgl-top-banner");
  if (!el) return 0;
  const style = window.getComputedStyle(el);
  const marginBottom = Number.parseFloat(style.marginBottom) || 0;
  return el.getBoundingClientRect().height + marginBottom;
}

/**
 * 侧栏列：桌面端把内容**固定在视口**（position: fixed）而不是随页面滚动的 sticky。
 * sticky 在页面很矮时会被容器底部"顶"着上移（首页文章列表就是这种情况），
 * fixed 则始终钉在同一位置，不随正文滚动、也不被页脚挤动。
 * 列宽由外层 aside（仍在网格里，负责占位与响应式显隐）量出来。
 */
export function SidebarColumn({
  side,
  children,
}: {
  side: "left" | "right";
  children: ReactNode;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const [bannerOffset, setBannerOffset] = useState(0);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) setBox({ left: rect.left, width: rect.width });
      });
    };
    measure();
    // 页面进入淡入动画（500ms）会短暂影响布局，结束后再校准一次
    const timer = setTimeout(measure, 700);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 顶上有没有节日横幅：有就把侧栏整体下移一个横幅的高度
  useEffect(() => {
    let raf = 0;
    const sync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBannerOffset(measureBannerOffset()));
    };
    sync();
    const timer = setTimeout(sync, 700);
    const banner = document.getElementById("wgl-top-banner");
    const observer = new MutationObserver(sync);
    // 横幅的出现/消失（关闭后 React 卸载节点）——监听 main 的子节点变化
    observer.observe(document.body, { childList: true, subtree: true });
    if (banner) observer.observe(banner, { attributes: true, childList: true, subtree: true });
    window.addEventListener("resize", sync);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  const top = BASE_TOP_OFFSET + bannerOffset;

  return (
    <aside ref={asideRef} className={side === "left" ? "hidden xl:block" : "hidden lg:block"}>
      <div
        className="wgl-scroll space-y-4 overflow-y-auto"
        style={
          box
            ? {
                position: "fixed",
                left: box.left,
                top,
                width: box.width,
                maxHeight: `calc(100vh - ${top + 32}px)`,
              }
            : undefined
        }
      >
        {children}
      </div>
    </aside>
  );
}
