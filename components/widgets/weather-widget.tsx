"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  RefreshCw,
  Sun,
  Wind,
} from "lucide-react";
import type { WeatherSnapshot } from "@/lib/weather";
import { WidgetHeading } from "./widget-heading";
import { formatClock } from "@/lib/format";

type Snapshot = WeatherSnapshot & { configured: boolean };

/** 心知天气现象代码 → lucide 图标（免费版只给文字/代码/气温，图标按代码分组） */
function iconFor(code: string, className = "h-4 w-4") {
  const n = Number(code);
  if (!Number.isFinite(n)) return <CloudSun className={className} />;
  if (n === 0) return <Sun className={className} />;
  if (n === 1) return <CloudSun className={className} />;
  if (n === 2) return <Cloud className={className} />;
  if (n === 4 || n === 5) return <CloudLightning className={className} />;
  if (n === 6 || n === 19) return <CloudHail className={className} />;
  if (n === 13 || n === 14 || n === 15 || n === 16 || n === 17 || n === 26 || n === 27 || n === 28) {
    return <CloudSnow className={className} />;
  }
  if (n === 20 || n === 29 || n === 30 || n === 31) return <Wind className={className} />;
  if (n === 18 || n === 32 || n === 33 || n === 34 || n === 35 || n === 36 || n === 37 || n === 38) {
    return <CloudFog className={className} />;
  }
  if ((n >= 3 && n <= 12) || (n >= 21 && n <= 25)) return <CloudRain className={className} />;
  return <CloudSun className={className} />;
}


function mmdd(date: string): string {
  const parts = date.split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : date;
}

const REFRESH_MS = 10 * 60_000;

export function WeatherWidget() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/weather${force ? "?force=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      setSnap((await res.json()) as Snapshot);
    } catch {
      // 静默：保留上一次数据
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetch("/api/weather", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<Snapshot>) : null))
        .then((data) => {
          if (cancelled || !data) return;
          setSnap(data);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setBusy(false);
        });

    void tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const now = snap?.now;
  const place = snap?.place;
  const daily = snap?.daily ?? [];

  return (
    <section aria-label="天气">
      <div className="mb-3 flex items-center justify-between gap-2">
        <WidgetHeading>天气</WidgetHeading>
        <button
          type="button"
          onClick={() => {
            setBusy(true);
            void load(true);
          }}
          disabled={busy}
          aria-label="刷新天气"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!snap ? (
        <p className="text-xs text-muted-foreground">正在取天气…</p>
      ) : !snap.ok || !now ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {snap.configured ? (snap.error ?? "暂时取不到天气") : "还没配置天气（工作台 →「天气」里填心知私钥并选城市）"}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {iconFor(now.code, "h-9 w-9 shrink-0 text-primary")}
            <div className="min-w-0">
              <div className="text-2xl font-semibold leading-none">
                {now.temperature}
                <span className="ml-0.5 text-sm font-normal text-muted-foreground">°C</span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {now.text}
                {place?.name ? ` · ${place.name}` : ""}
              </div>
            </div>
          </div>

          {daily.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-1">
              {daily.slice(0, 3).map((day) => (
                <div key={day.date} className="rounded-xl bg-accent/40 px-1 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground tabular-nums">{mmdd(day.date)}</div>
                  <div className="my-1 flex justify-center text-primary">{iconFor(day.codeDay, "h-4 w-4")}</div>
                  <div className="truncate text-[11px]">{day.textDay}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {day.high}° / {day.low}°
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {snap?.fallback ? `${snap.fallback.to} · ${snap.fallback.from} 暂无数据 · ` : ""}
          {snap?.stale ? "缓存数据 · " : ""}
          {snap?.fetchedAt ? `${formatClock(snap.fetchedAt)} 更新` : ""}
        </span>
        {/* 心知天气免费版要求标注来源 */}
        <a href="https://www.seniverse.com/" target="_blank" rel="noreferrer" className="transition-colors hover:text-primary">
          数据来源：心知天气
        </a>
      </div>
    </section>
  );
}
