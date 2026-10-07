"use client";

import { useEffect, useRef } from "react";

/**
 * 背景视频。
 * 首屏先让静态背景图（poster）顶着，等页面加载完 300ms 再挂 src 播放，
 * 避免几十 MB 的视频和页面关键资源抢带宽；配合 /content-images 的
 * 长缓存（immutable），第二次访问基本零加载成本。
 */
export function BackgroundVideo({
  src,
  poster,
  filter,
  transform,
  hidden,
}: {
  src?: string;
  poster?: string;
  filter?: string;
  transform?: string;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;
    // 后台设置页已经在实时预览（自己设过 src）时不插手
    if (video.getAttribute("src")) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      timer = setTimeout(() => {
        if (video.getAttribute("src")) return;
        video.style.opacity = "0";
        video.preload = "auto";
        video.src = src;
        video.addEventListener(
          "playing",
          () => {
            video.style.opacity = "1";
          },
          { once: true },
        );
        void video.play().catch(() => {
          video.style.opacity = "1";
        });
      }, 300);
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      data-wgl-bg-video
      aria-hidden
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      poster={poster || undefined}
      className="pointer-events-none fixed inset-0 -z-20 h-full w-full object-cover transition-opacity duration-500"
      style={{
        filter,
        transform,
        display: hidden ? "none" : undefined,
      }}
    />
  );
}
