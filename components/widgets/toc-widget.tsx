"use client";

import { useEffect, useRef, useState } from "react";
import type { TocItem } from "@/lib/markdown/render";

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function TocWidget({ toc }: { toc?: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(() => toc?.[0]?.id ?? "");
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!toc || toc.length === 0) return;
    const elements = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [toc]);

  // 高亮项变化时，自动把它滚进目录面板的可视区
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLElement>('a[aria-current="location"]');
    if (!el) return;

    const scroller = findScrollParent(nav);
    if (!scroller) {
      el.scrollIntoView({ block: "nearest" });
      return;
    }
    const cRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const margin = 12;
    if (eRect.top < cRect.top + margin) {
      scroller.scrollTo({
        top: scroller.scrollTop - (cRect.top + margin - eRect.top),
        behavior: "smooth",
      });
    } else if (eRect.bottom > cRect.bottom - margin) {
      scroller.scrollTo({
        top: scroller.scrollTop + (eRect.bottom - cRect.bottom + margin),
        behavior: "smooth",
      });
    }
  }, [activeId]);

  if (!toc || toc.length === 0) return null;

  return (
    <nav ref={navRef} aria-label="目录" className="text-sm">
      <p className="mb-3 font-heading text-xs font-semibold tracking-widest text-muted-foreground">
        目录
      </p>
      <ul className="border-l border-border">
        {toc.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} style={{ paddingLeft: (item.depth - 2) * 12 }}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1 pl-3 transition-colors ${
                  active
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
