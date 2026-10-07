import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * 列表/索引页统一的页首行：标题 + 可选图标 + 父级入口 + 说明小字。
 *
 * 标题 26px（手机）/30px（桌面）+ 字距收紧；下一条细线；
 * 右侧「父级 →」是索引页的标准出口（归档页去标签、标签详情回全部标签…）。
 */
export function PageHeader({
  title,
  icon: Icon,
  meta,
  action,
  description,
  className,
  titleClassName,
}: {
  title: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** 标题下的一行小字（数量、时间范围等），自动 tabular-nums */
  meta?: ReactNode;
  /** 右上角入口，如「全部档案 →」 */
  action?: ReactNode;
  /** 需要一段说明文字时用 */
  description?: ReactNode;
  className?: string;
  /** 首页的「最近更新」比索引页标题小一号 */
  titleClassName?: string;
}) {
  return (
    <div className={cn("border-b border-border/60 pb-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1
          className={cn(
            "flex items-center gap-2 font-heading font-semibold tracking-[-0.3px]",
            titleClassName ?? "text-[26px] sm:text-[30px]",
          )}
        >
          {Icon ? <Icon className="h-5 w-5 shrink-0 text-primary" /> : null}
          {title}
        </h1>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {meta ? (
        <p className="mt-1 text-[12.5px] tabular-nums text-muted-foreground">{meta}</p>
      ) : null}
      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
