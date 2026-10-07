import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * 全站统一的「局部 scrim 面板」。
 *
 * 保留动态背景的前提下，正文/内容区需要自己的对比度底：
 * 半透明底 + 背景模糊 + 1px 细线边框，圆角与全站一致（rounded-2xl = 1rem）。
 * 长文页（关于 / 免责声明 / 隐私政策 / 开源说明）用 `wide` 拿到更松的内边距。
 */
export function Panel({
  children,
  className,
  wide = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** 长文页：内边距更松（p-5 sm:p-10） */
  wide?: boolean;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-border/60 bg-background/75 backdrop-blur-md",
        wide ? "p-5 sm:p-10" : "p-5 sm:p-8",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
