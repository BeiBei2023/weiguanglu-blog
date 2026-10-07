"use client";

import { useState } from "react";
import { Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function postUrl(slug: string): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return `${base}/posts/${encodeURIComponent(slug)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement("input");
    input.value = text;
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 分享 / 复制链接（手机上调系统分享，电脑上复制到剪贴板） */
export function ShareButton({ slug, title }: { slug: string; title: string }) {
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
    const url = postUrl(slug);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 用户取消分享 → 退回复制
      }
    }
    const ok = await copyText(url);
    if (ok) toast.success("链接已复制");
    else toast.error("复制失败，请手动复制地址栏链接");
  };

  const onCopy = async () => {
    setBusy(true);
    const ok = await copyText(postUrl(slug));
    setBusy(false);
    if (ok) toast.success("链接已复制");
    else toast.error("复制失败，请手动复制地址栏链接");
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => void onShare()}
        title="分享这篇文章"
      >
        <Share2 className="size-3.5" />
        分享
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => void onCopy()}
        disabled={busy}
        title="复制文章链接"
      >
        <Link2 className="size-3.5" />
        复制链接
      </Button>
    </span>
  );
}
