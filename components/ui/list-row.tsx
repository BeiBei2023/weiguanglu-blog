import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * 统一的「索引行」：两行制 + hover 时左侧亮起 2px 橙游标。
 *
 * 首页/归档/系列/标签/管理端已经各写了一遍同样的结构，这里收成一处。
 * - `title`：第一行（主链接由调用方包在 title 里）
 * - `meta`：第二行（状态点 · slug · 标签…）
 * - `trailing`：右侧（日期、计数、图标按钮）
 */
export function ListRow({
  title,
  meta,
  trailing,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div className="flex items-baseline gap-3 py-3.5 pl-3">
        <span className="min-w-0 flex-1">
          {title}
          {meta ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </span>
        {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      </div>
    </div>
  );
}

/** 状态点：公开=实心 · 登录可见=空心 · 草稿=虚线框（橙不参与状态着色） */
export const STATUS_DOT = {
  public: "border border-emerald-500 bg-emerald-500",
  login: "border border-amber-500 bg-transparent",
  draft: "border border-dashed border-muted-foreground/70 bg-transparent",
} as const;

export function StatusDot({ kind, className }: { kind: keyof typeof STATUS_DOT; className?: string }) {
  return (
    <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[kind], className)} />
  );
}
