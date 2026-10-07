import type { ReactNode } from "react";
import { FestivalBanner } from "@/components/festival/festival-banner";
import { resolveFestival } from "@/lib/festival";
import { getSiteConfig } from "@/lib/site-config";

/**
 * 文章页专属布局：节日横幅**只在这里**出现。
 * 之前它挂在根 layout 上（全站每页都有），现在收进文章页；
 * 背景光晕与粒子仍由根 layout 提供，不受影响。
 */
export default function PostLayout({ children }: { children: ReactNode }) {
  const festival = resolveFestival(getSiteConfig().festival);

  return (
    <>
      {festival ? (
        <FestivalBanner
          id={festival.id}
          name={festival.name}
          greeting={festival.greeting}
          emoji={festival.emoji}
          color={festival.color}
          start={festival.start}
          end={festival.end}
          day={festival.day}
          total={festival.total}
          progress={festival.progress}
          preview={festival.preview}
        />
      ) : null}
      {children}
    </>
  );
}
