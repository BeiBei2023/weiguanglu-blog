/**
 * 节日徽标（服务端渲染的纯静态标签，不引粒子/客户端逻辑）
 *
 * 用法：`<FestivalBadge />` 放在页脚；不是节日时返回 null。
 * 有跨度（>1 天）时带进度：`第 3/7 天`；后台指定预览时显示「预览 · 共 N 天」。
 */

import { resolveFestival } from "@/lib/festival";
import { getSiteConfig } from "@/lib/site-config";

export function FestivalBadge({ className }: { className?: string }) {
  const festival = resolveFestival(getSiteConfig().festival);
  if (!festival) return null;

  const progress = festival.preview
    ? festival.total > 1
      ? `预览 · 共 ${festival.total} 天`
      : "预览"
    : festival.total > 1
      ? `第 ${festival.day}/${festival.total} 天`
      : "";

  return (
    <span
      className={
        className ??
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors"
      }
      style={{
        color: festival.color,
        borderColor: `color-mix(in oklab, ${festival.color} 45%, transparent)`,
        background: `color-mix(in oklab, ${festival.color} 12%, transparent)`,
      }}
      title={`${festival.name} · ${festival.greeting}（${festival.start} 至 ${festival.end}）`}
    >
      <span aria-hidden>{festival.emoji}</span>
      <span>{festival.greeting}</span>
      {progress ? <span className="opacity-75">· {progress}</span> : null}
    </span>
  );
}
