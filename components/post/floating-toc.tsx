"use client";

import { useState } from "react";
import { List } from "lucide-react";
import type { TocItem } from "@/lib/markdown/render";

/** 移动端浮动目录：<lg 显示；点右下角圆形按钮弹出玻璃面板，点条目跳转锚点 */
export function FloatingToc({ toc }: { toc: TocItem[] }) {
  const [open, setOpen] = useState(false);
  if (toc.length === 0) return null;

  function go(id: string) {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <button
        type="button"
        aria-label="打开目录"
        onClick={() => setOpen(true)}
        className="glass-soft fixed bottom-6 left-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground shadow-lg transition-colors hover:text-primary lg:hidden"
      >
        <List className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass-modal max-h-[65vh] w-full overflow-y-auto rounded-t-3xl px-5 pb-8 pt-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
            <p className="mb-3 font-heading text-xs font-semibold tracking-widest text-muted-foreground">
              目录
            </p>
            <ul>
              {toc.map((item) => (
                <li key={item.id} style={{ paddingLeft: (item.depth - 2) * 14 }}>
                  <button
                    type="button"
                    onClick={() => go(item.id)}
                    className="block w-full py-2 text-left text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
