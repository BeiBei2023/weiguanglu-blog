import { cn } from "cn";

/**
 * 通用骨架屏（loading.tsx 用）。
 * 形状固定、无状态，直接用即可；需要别的形状用 <Skeleton> 自己拼。
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

/** 页面级骨架：页首一条 + N 个区块 */
export function PageSkeleton({
  blocks = 4,
  className,
}: {
  blocks?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: blocks }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}

/** 列表骨架：rows 行两行制占位 */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/60", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
