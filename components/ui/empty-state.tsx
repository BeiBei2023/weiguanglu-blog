import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/**
 * 空状态：列表没有内容 / 搜索没结果 / 还没建过任何东西时用。
 * 读稿台语言：图标方块 + 一行标题 + 一句说明 + 可选动作，居中、留白足够。
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="mt-3.5 font-heading text-[15px] font-medium">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-[44ch] text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
