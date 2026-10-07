"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markCommentsSeenAction } from "@/app/w/comments/actions";

/** 评论动态页的小工具条：刷新 + 全部标为已读 */
export function CommentsToolbar({ unread }: { unread: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setBusy(true);
    router.refresh();
    // router.refresh 没有回调，转一小会儿再放开（server render 很快）
    window.setTimeout(() => setBusy(false), 800);
  };

  const markRead = () => {
    startTransition(async () => {
      const result = await markCommentsSeenAction();
      if (!result.ok) {
        toast.error(result.error ?? "操作失败");
        return;
      }
      toast.success(result.notice ?? "已标为已读");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
        <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
        刷新
      </Button>
      <Button variant="outline" size="sm" onClick={markRead} disabled={pending || unread === 0}>
        <CheckCheck className="size-3.5" />
        全部标为已读{unread > 0 ? `（${unread}）` : ""}
      </Button>
    </div>
  );
}
