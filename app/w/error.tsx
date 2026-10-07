"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 工作站各页的错误兜底（之前没有 error.tsx，读数据失败会直接落到 Next 默认错误页） */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[w] 页面渲染失败", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-16">
      <div className="glass rounded-3xl p-6 sm:p-10">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          <h1 className="font-heading text-xl font-bold">这个页面出错了</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          工作站这一页没能正常加载（可能是数据文件读取失败，或服务暂时不可用）。可以重试，或先回工作台。
        </p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground/80">{error.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => reset()}>
            <RotateCcw className="size-4" />
            重试
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/w">返回工作台</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/w/status">看服务器状态</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
