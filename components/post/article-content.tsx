"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

/** 超过多少行的代码块默认折叠（可展开/收起） */
const DEFAULT_COLLAPSE_LINES = 20;

export function ArticleContent({
  html,
  collapseLines = DEFAULT_COLLAPSE_LINES,
}: {
  html: string;
  collapseLines?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [slides, setSlides] = useState<{ src: string }[]>([]);
  const [index, setIndex] = useState(-1);

  // 为每个代码块注入「复制」按钮
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const cleanups: (() => void)[] = [];

    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      if (pre.querySelector(".wgl-copy")) continue;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "wgl-copy";
      button.textContent = "复制";
      button.setAttribute("aria-label", "复制代码");

      const onClick = () => {
        const code = pre.querySelector("code") ?? pre;
        const lineEls = Array.from(code.querySelectorAll("[data-line]"));
        const text =
          lineEls.length > 0
            ? lineEls.map((line) => line.textContent ?? "").join("\n")
            : code.textContent ?? "";
        navigator.clipboard?.writeText(text).then(
          () => {
            button.textContent = "已复制";
            window.setTimeout(() => {
              button.textContent = "复制";
            }, 1500);
          },
          () => {
            button.textContent = "复制失败";
            window.setTimeout(() => {
              button.textContent = "复制";
            }, 1500);
          },
        );
      };

      button.addEventListener("click", onClick);
      pre.appendChild(button);
      cleanups.push(() => {
        button.removeEventListener("click", onClick);
        button.remove();
      });

      // 超长代码块默认折叠（超过 COLLAPSE_LINES 行时收起，可展开/收起）
      const code = pre.querySelector("code") ?? pre;
      const lineEls = Array.from(code.querySelectorAll("[data-line]"));
      const lineCount =
        lineEls.length > 0 ? lineEls.length : (code.textContent ?? "").split("\n").length;
      if (collapseLines > 0 && lineCount > collapseLines) {
        pre.classList.add("wgl-collapsed");
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "wgl-collapse-toggle";
        toggle.textContent = `展开代码（共 ${lineCount} 行）`;
        toggle.setAttribute("aria-expanded", "false");
        const onToggle = () => {
          const collapsed = pre.classList.toggle("wgl-collapsed");
          toggle.textContent = collapsed ? `展开代码（共 ${lineCount} 行）` : "收起代码";
          toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        };
        toggle.addEventListener("click", onToggle);
        const host = pre.parentElement ?? pre;
        host.appendChild(toggle);
        cleanups.push(() => {
          toggle.removeEventListener("click", onToggle);
          toggle.remove();
          pre.classList.remove("wgl-collapsed");
        });
      }
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [html, collapseLines]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName !== "IMG") return;
    const root = containerRef.current;
    if (!root) return;
    const images = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
    if (images.length === 0) return;
    setSlides(images.map((img) => ({ src: img.currentSrc || img.src })));
    const i = images.indexOf(target as HTMLImageElement);
    setIndex(i >= 0 ? i : 0);
    event.preventDefault();
  }

  return (
    <>
      <div
        ref={containerRef}
        className="prose-wgl"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <Lightbox
        open={index >= 0}
        index={Math.max(index, 0)}
        slides={slides}
        close={() => setIndex(-1)}
      />
    </>
  );
}
