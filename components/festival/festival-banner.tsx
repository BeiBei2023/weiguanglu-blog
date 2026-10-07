"use client";

/**
 * 节日横幅（客户端）：节日区间内显示在页面顶部
 *
 * - 有跨度（>1 天）时带进度条 + 「第 N/M 天」+ 百分比 + 起止日期
 * - 可关闭：localStorage 按「节日 id + 结束日」记住，换节日或明年同期会重新出现
 * - 用 useSyncExternalStore 读 localStorage：服务端快照固定为「未关闭」，
 *   水合后自动切到真实值（避免在 effect 里 setState 造成级联渲染）
 * - 外面套一层和页面正文相同的 grid：卡片只占正文那一列 + 页面内边距，
 *   不会和 fixed 定位的侧栏（sidebar-column）在横向叠在一起
 */
import { useCallback, useSyncExternalStore } from "react";

export interface FestivalBannerProps {
  id: string;
  name: string;
  greeting: string;
  emoji: string;
  color: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  day: number;
  total: number;
  /** 0–1 */
  progress: number;
  preview?: boolean;
}

const STORAGE_KEY = "wgl-festival-dismissed";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  // 其它标签页关掉横幅时也同步
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function readDismissed(stamp: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === stamp;
  } catch {
    // 隐私模式 / 禁用存储：当作没关过
    return false;
  }
}

export function FestivalBanner(props: FestivalBannerProps) {
  const { name, greeting, emoji, color, start, end, day, total, progress, preview } = props;
  const stamp = `${props.id}:${end}`;

  const getSnapshot = useCallback(() => readDismissed(stamp), [stamp]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, stamp);
    } catch {
      /* 忽略 */
    }
    emit();
  }, [stamp]);

  if (dismissed) return null;

  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const remaining = Math.max(0, total - day);
  const tint = (alpha: number) => `color-mix(in oklab, ${color} ${alpha}%, transparent)`;
  const bright = `color-mix(in oklab, ${color} 60%, #ffffff)`;

  return (
    <div id="wgl-top-banner" className="px-4 pt-3 pb-3">
      {/* 和文章页/首页正文同款 grid：横幅只落在正文那一列（xl 下左右两侧留给固定侧栏） */}
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_var(--sb-right)] lg:justify-center xl:grid-cols-[var(--sb-left)_minmax(0,1fr)_var(--sb-right)] xl:justify-center">
        <div className="min-w-0 lg:col-start-1 xl:col-start-2">
          <div
            className="animate-in fade-in slide-in-from-top-2 relative flex w-full flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden rounded-2xl border px-3 py-2.5 duration-500 sm:px-4"
            style={{
              borderColor: tint(30),
              background: `linear-gradient(100deg, ${tint(16)}, ${tint(4)} 62%, transparent)`,
              boxShadow: `0 14px 34px -26px ${color}`,
            }}
          >
            {/* 左上角一团节日色光晕 */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-6 -top-12 h-28 w-28 rounded-full blur-2xl"
              style={{ background: tint(30) }}
            />

            <span
              aria-hidden
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-lg leading-none"
              style={{ borderColor: tint(35), background: tint(18) }}
            >
              {emoji}
            </span>

            <div className="relative min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold" style={{ color }}>
                  {greeting}
                </span>
                <span className="text-[11px] opacity-65">{name}</span>
                {preview ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] leading-none"
                    style={{ background: tint(20) }}
                  >
                    预览
                  </span>
                ) : null}
                <span className="tabular-nums text-[11px] opacity-70">
                  {total > 1 ? `第 ${day} / ${total} 天` : "今天"}
                </span>
              </div>

              {total > 1 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    aria-hidden
                    className="h-1.5 w-full max-w-[240px] min-w-[96px] overflow-hidden rounded-full"
                    style={{ background: tint(20) }}
                  >
                    <span
                      className="block h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${bright})` }}
                    />
                  </span>
                  <span className="tabular-nums text-[11px] font-medium opacity-80">{pct}%</span>
                  <span className="text-[11px] tabular-nums opacity-55">
                    {start.slice(5)} → {end.slice(5)}
                  </span>
                  {remaining > 0 ? (
                    <span className="text-[11px] opacity-55">还剩 {remaining} 天</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              aria-label="关闭节日横幅"
              title={`本次「${name}」期间不再显示横幅`}
              className="relative ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] leading-none opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
              onClick={dismiss}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
