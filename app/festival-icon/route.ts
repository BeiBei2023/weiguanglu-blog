import { resolveFestival } from "@/lib/festival";
import type { FestivalEntry } from "@/lib/festival-defaults";
import { festivalIconSvg } from "@/lib/festival-icon";
import { getSiteConfig } from "@/lib/site-config";

/**
 * 节日当天替换站点的 icon / shortcut / apple-touch-icon。
 *
 * 放在根目录文件约定之前：`generateMetadata()` 的 icons 里显式引用这些路由，
 * 节日当天的标签页图标就是节日版；不是节日时返回 404，由静态文件兜底。
 */

export const dynamic = "force-dynamic";

function pngFromSvg(svg: string): Buffer {
  // 兜底：Next 的 ImageResponse 依赖较重，这里直接返回 SVG（浏览器均支持）
  return Buffer.from(svg, "utf8");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const preview = url.searchParams.get("f");
  const festival: FestivalEntry | null = preview
    ? resolveFestival(preview)
    : resolveFestival(getSiteConfig().festival);

  if (!festival) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(pngFromSvg(festivalIconSvg(festival, 64)) as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // 当天缓存 1 小时即可，节日过后自然失效
      "Cache-Control": "public, max-age=3600",
    },
  });
}
