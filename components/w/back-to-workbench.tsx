import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** 工作台各服务页顶部的「返回工作台」入口 */
export function BackToWorkbench({ className }: { className?: string }) {
  return (
    <Link
      href="/w"
      className={
        className ??
        "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      返回工作台
    </Link>
  );
}
