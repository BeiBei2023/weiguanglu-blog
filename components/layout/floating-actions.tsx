"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, List } from "lucide-react";
import { cn } from "cn";

const BTN =
  "glass-soft inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground shadow-lg transition-colors hover:text-primary";

/** 右下角悬浮操作：回到顶部 / 回到底部；文章页额外给一个「返回列表」 */
export function FloatingActions() {
  const pathname = usePathname();
  const [showTop, setShowTop] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        setShowTop(y > 400);
        setAtBottom(y >= max - 80);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const onArticle = pathname.startsWith("/posts/");

  return (
    <div className="fixed bottom-6 right-5 z-40 flex flex-col items-center gap-2">
      {onArticle ? (
        <Link href="/" className={cn(BTN)} title="返回列表" aria-label="返回列表">
          <List className="h-4 w-4" />
        </Link>
      ) : null}
      {showTop && !atBottom ? (
        <button
          type="button"
          title="回到底部"
          aria-label="回到底部"
          onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
          className={BTN}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      ) : null}
      {showTop ? (
        <button
          type="button"
          title="回到顶部"
          aria-label="回到顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={BTN}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
