"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  RefreshCw,
  Save,
  Search,
  Sun,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  refreshWeatherAction,
  saveWeatherConfigAction,
  searchLocationAction,
} from "@/app/w/weather/actions";
import type { LocationHit, WeatherConfig, WeatherSnapshot } from "@/lib/weather";
import { formatClock } from "@/lib/format";

type Snapshot = WeatherSnapshot & { configured: boolean };

/** 天气代码 → lucide 图标（与侧栏挂件同一套分组） */
function iconFor(code: string | number | undefined, className: string) {
  const parsed = Number(code);
  const c = Number.isFinite(parsed) ? parsed : 1;
  if (c === 0) return <Sun className={className} />;
  if (c === 2) return <Cloud className={className} />;
  if (c === 4 || c === 5) return <CloudLightning className={className} />;
  if (c === 6 || c === 19) return <CloudHail className={className} />;
  if ((c >= 13 && c <= 17) || (c >= 26 && c <= 28)) return <CloudSnow className={className} />;
  if (c === 20 || (c >= 29 && c <= 31)) return <Wind className={className} />;
  if (c === 18 || (c >= 32 && c <= 38)) return <CloudFog className={className} />;
  if ((c >= 3 && c <= 12) || (c >= 21 && c <= 25)) return <CloudRain className={className} />;
  return <CloudSun className={className} />;
}


export function WeatherPanel({
  initialConfig,
  initialSnapshot,
}: {
  initialConfig: WeatherConfig;
  initialSnapshot: Snapshot;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<WeatherConfig>(initialConfig);
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot);
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<LocationHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof WeatherConfig>(key: K, value: WeatherConfig[K]) {
    setCfg((current) => ({ ...current, [key]: value }));
  }

  const dirty = JSON.stringify(cfg) !== JSON.stringify(initialConfig);

  function onSave() {
    startTransition(async () => {
      const result = await saveWeatherConfigAction(cfg);
      if (!result.ok) {
        setMessage(result.error ?? "保存失败");
        toast.error(result.error ?? "保存失败");
        return;
      }
      if (result.snapshot) setSnap(result.snapshot);
      setMessage(result.notice ?? "已保存");
      toast.success(
        result.snapshot?.ok ? "已保存，天气读取成功" : (result.snapshot?.error ?? "已保存"),
      );
      router.refresh();
    });
  }

  function onSearch() {
    startTransition(async () => {
      setHits([]);
      // 直接带上传当前输入框里的私钥，没保存也能搜
      const result = await searchLocationAction(keyword, cfg.key);
      if (result.hits) setHits(result.hits);
      if (!result.ok) {
        setSearchNote(result.error ?? result.notice ?? "没找到");
        toast.error(result.error ?? result.notice ?? "没找到");
        return;
      }
      setSearchNote(
        result.hits?.length ? `找到 ${result.hits.length} 个地点，点一个即可设为常驻城市` : (result.notice ?? null),
      );
      toast.success(result.notice ?? "已找到");
    });
  }

  function onRefresh() {
    startTransition(async () => {
      const result = await refreshWeatherAction();
      if (result.snapshot) setSnap(result.snapshot);
      if (!result.ok) {
        setMessage(result.error ?? "刷新失败");
        toast.error(result.error ?? "刷新失败");
        return;
      }
      setMessage("已刷新");
      toast.success("已刷新");
    });
  }

  return (
    <div className="space-y-4">
      {/* ── 当前状态 ── */}
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold">当前状态</h2>
          <div className="flex items-center gap-2">
            {snap.configured ? null : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                未配置
              </span>
            )}
            {snap.stale ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                缓存数据
              </span>
            ) : null}
            {snap.fallback ? (
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-400">
                {snap.fallback.from} 无数据，显示 {snap.fallback.to}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={pending}>
              <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
              刷新 / 测试连接
            </Button>
          </div>
        </div>

        {snap.ok && snap.now ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-primary">{iconFor(snap.now.code, "h-10 w-10")}</span>
              <div>
                <p className="text-2xl font-bold">
                  {snap.now.temperature}
                  <span className="text-base">°{cfg.unit === "f" ? "F" : "C"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {snap.now.text}
                  {snap.place ? ` · ${snap.place.name}` : ""}
                </p>
              </div>
            </div>
            {snap.daily?.length ? (
              <div className="mt-4 grid grid-cols-3 gap-2 wgl-cells">
                {snap.daily.map((day) => (
                  <div
                    key={day.date}
                    className="rounded-2xl border border-border/60 bg-accent/10 px-3 py-2 text-center"
                  >
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {day.date.slice(5)}
                    </p>
                    <span className="mt-1 inline-flex text-primary">
                      {iconFor(day.codeDay, "h-5 w-5")}
                    </span>
                    <p className="mt-1 text-[11px]">{day.textDay}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {day.high}° / {day.low}°
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{formatClock(snap.fetchedAt)} 更新</span>
              <a
                href="https://www.seniverse.com/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-primary"
              >
                数据来源：心知天气
              </a>
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            {snap.error ?? "还没有天气数据"}
            {snap.errorCode ? `（${snap.errorCode}）` : ""}
          </p>
        )}

        {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
      </section>

      {/* ── 配置 ── */}
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold">配置</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            启用挂件
            <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">API 私钥（key）</label>
            <p className="mt-1 text-xs text-muted-foreground">
              心知天气控制台里的「私钥」，只存在服务器上，不会下发给访客页面。
            </p>
            <Input
              type="password"
              value={cfg.key}
              onChange={(event) => set("key", event.target.value)}
              placeholder="在此粘贴私钥"
              className="mt-2 tabular-nums"
            />
          </div>

          <div>
            <label className="text-sm font-medium">API 公钥（uid，可选）</label>
            <p className="mt-1 text-xs text-muted-foreground">
              现在用不到（服务端直连走私钥）；先留着，以后要做前端签名会用到。
            </p>
            <Input
              value={cfg.uid}
              onChange={(event) => set("uid", event.target.value)}
              placeholder="可留空"
              className="mt-2 tabular-nums"
            />
          </div>

          <div>
            <label className="text-sm font-medium">城市</label>
            <p className="mt-1 text-xs text-muted-foreground">
              当前：
              <span className="text-foreground">
                {cfg.locationName || "（未选）"}
              </span>
              {cfg.location ? <span className="tabular-nums"> · {cfg.location}</span> : null}
              （搜到后点一下结果即可设为常驻城市；保存前也能搜）
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearch();
                }}
                placeholder="输入城市名，如 重庆 / chongqing"
                className="max-w-[260px]"
              />
              <Button variant="outline" size="sm" onClick={onSearch} disabled={pending}>
                <Search className="size-3.5" />
                搜索
              </Button>
            </div>
            {searchNote ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{searchNote}</p>
            ) : null}
            {hits.length ? (
              <>
                <p className="mt-2 text-xs text-muted-foreground">点一个即可设为常驻城市：</p>
                <ul className="mt-1 grid gap-1.5 sm:grid-cols-2 wgl-cells">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        // 心知免费版只有「城市」粒度：区/县查不到时自动退回上级城市
                        // （搜索给的 path 形如「从化,广州,广东,中国」，第 2 段就是上级城市）
                        const parts = hit.path
                          .split(",")
                          .map((part) => part.trim())
                          .filter(Boolean);
                        set("location", hit.id);
                        set("locationName", hit.name);
                        set("locationParent", parts.length >= 4 ? parts[1] : "");
                        setHits([]);
                        setSearchNote(null);
                        toast.success(`已选：${hit.name}，别忘了点保存`);
                      }}
                      className="w-full rounded-2xl border border-border/60 bg-accent/10 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
                    >
                      <span className="font-medium">{hit.name}</span>
                      <span className="ml-2 text-[10px] tabular-nums text-muted-foreground">
                        {hit.id}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {[hit.country, hit.path].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
                </ul>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <label className="text-sm font-medium">单位</label>
              <div className="mt-2 inline-flex rounded-full border border-border p-0.5">
                {(["c", "f"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => set("unit", unit)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs transition-colors",
                      cfg.unit === unit
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {unit === "c" ? "摄氏 ℃" : "华氏 ℉"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">缓存分钟</label>
              <p className="mt-1 text-xs text-muted-foreground">5–180，避免刷爆免费额度</p>
              <Input
                type="number"
                min={5}
                max={180}
                value={cfg.cacheMinutes}
                onChange={(event) => set("cacheMinutes", Number(event.target.value))}
                className="mt-2 w-28"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={onSave} disabled={pending || !dirty}>
            <Save className="size-3.5" />
            保存
          </Button>
          {dirty ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">有未保存的改动</span>
          ) : (
            <span className="text-xs text-muted-foreground">改动会自动同步到侧栏挂件</span>
          )}
        </div>
      </section>
    </div>
  );
}
