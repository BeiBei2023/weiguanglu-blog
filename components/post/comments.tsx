"use client";

import Link from "next/link";
import Giscus from "@giscus/react";
import { useTheme } from "next-themes";
import { GISCUS, commentsEnabled } from "@/lib/comments";

export function Comments({ panelStyle }: { panelStyle?: "dark" | "light" }) {
  const { resolvedTheme } = useTheme();
  if (!commentsEnabled) return null;

  const isLight = panelStyle === "light" || resolvedTheme !== "dark";

  return (
    <section className="mt-10">
      <h2 className="mb-2 text-lg font-semibold">评论</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        评论区由 giscus 提供（基于 GitHub Discussions），内容会保存在 GitHub 上；详见
        <Link href="/privacy" className="text-primary hover:underline">
          《隐私政策》
        </Link>
        。
      </p>
      <Giscus
        id="comments"
        repo={GISCUS.repo}
        repoId={GISCUS.repoId}
        category={GISCUS.category}
        categoryId={GISCUS.categoryId}
        mapping={GISCUS.mapping}
        reactionsEnabled={GISCUS.reactionsEnabled}
        emitMetadata="0"
        inputPosition={GISCUS.inputPosition}
        lang={GISCUS.lang}
        loading="lazy"
        theme={isLight ? GISCUS.themeLight : GISCUS.themeDark}
      />
    </section>
  );
}
