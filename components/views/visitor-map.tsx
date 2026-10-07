"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { cn } from "cn";
import type { Bucket, MapRange, MapSpot, VisitorMapData } from "@/lib/views-stats";
import { geoFeatureKeys } from "@/lib/geo-names";

type Scope = "china" | "world";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "china", label: "中国" },
  { id: "world", label: "世界" },
];

const RANGES: { id: MapRange; label: string }[] = [
  { id: "7d", label: "近 7 天" },
  { id: "30d", label: "近 30 天" },
  { id: "all", label: "全部" },
];

const MAP_URL: Record<Scope, string> = {
  china: "/maps/china.json",
  world: "/maps/world.json",
};

interface MapGeoJson {
  features?: { properties?: Record<string, unknown> }[];
}

type EchartsModule = typeof import("echarts/core");

let echartsPromise: Promise<EchartsModule> | null = null;

/** 懒加载 ECharts 内核（按需引入地图/散点 + tooltip/visualMap/geo，控制包体） */
function loadEcharts(): Promise<EchartsModule> {
  if (!echartsPromise) {
    echartsPromise = (async () => {
      const [core, charts, components, renderers] = await Promise.all([
        import("echarts/core"),
        import("echarts/charts"),
        import("echarts/components"),
        import("echarts/renderers"),
      ]);
      core.use([
        charts.MapChart,
        charts.ScatterChart,
        charts.EffectScatterChart,
        components.TooltipComponent,
        components.VisualMapComponent,
        components.GeoComponent,
        renderers.CanvasRenderer,
      ]);
      return core;
    })();
  }
  return echartsPromise;
}

const geoPromises = new Map<Scope, Promise<MapGeoJson>>();

function loadMapJson(scope: Scope): Promise<MapGeoJson> {
  let promise = geoPromises.get(scope);
  if (!promise) {
    promise = fetch(MAP_URL[scope]).then(async (res) => {
      if (!res.ok) throw new Error(`底图加载失败（HTTP ${res.status}）`);
      return (await res.json()) as MapGeoJson;
    });
    geoPromises.set(scope, promise);
  }
  return promise;
}

/** 主题色：深浅色 / 面板风格切换后重新读一遍 */
interface Palette {
  primary: string;
  foreground: string;
  muted: string;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.body);
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  return {
    primary: read("--primary", "#e07a52"),
    foreground: read("--foreground", "#f2efe9"),
    muted: read("--muted-foreground", "#b7b2a8"),
  };
}

/** #rrggbb / #rgb → rgba()；其它写法（rgba()/color-mix）原样返回 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex;
  if (/^[0-9a-fA-F]{6}$/.test(full)) {
    const n = Number.parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);
}

function relTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "—";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return iso.slice(0, 10);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.999 ? 0 : 1)}%`;
}

function barRows(buckets: Bucket[]): string {
  const total = buckets.reduce((sum, item) => sum + item.count, 0) || 1;
  return buckets
    .map(
      (item) =>
        `<div class="tip-bar"><span>${escapeHtml(item.name)}</span><em><i style="width:${Math.max(
          6,
          (item.count / total) * 100,
        ).toFixed(0)}%"></i></em><b>${item.count}</b></div>`,
    )
    .join("");
}

function spotTip(spot: MapSpot): string {
  const where = [spot.country, spot.region !== spot.name ? spot.region : "", spot.city !== spot.name ? spot.city : ""]
    .filter(Boolean)
    .join(" · ");
  const posts = spot.posts.length
    ? `<p class="tip-sec">最常看的文章</p><ul class="tip-posts">${spot.posts
        .map((post) => `<li title="${escapeHtml(post.title)}"><span>${escapeHtml(post.title)}</span><b>${post.count}</b></li>`)
        .join("")}</ul>`
    : "";
  return `<div class="wgl-map-tip">
    <div class="tip-head"><span class="tip-name">${escapeHtml(spot.name || "未知")}</span><span class="tip-share">${percent(
      spot.share,
    )}</span></div>
    ${where && where !== spot.name ? `<p class="tip-sub">${escapeHtml(where)}</p>` : ""}
    <div class="tip-row"><span>访客 <b>${spot.uv}</b></span><span>浏览 <b>${spot.pv}</b></span></div>
    <p class="tip-sec">设备</p>${barRows(spot.device)}
    <p class="tip-sec">浏览器</p>${barRows(spot.browser)}
    ${posts}
    <p class="tip-foot">最近访问：${escapeHtml(relTime(spot.last))}</p>
  </div>`;
}

function regionTip(name: string, pv: number, uv: number, spots: number, share: number): string {
  return `<div class="wgl-map-tip">
    <div class="tip-head"><span class="tip-name">${escapeHtml(name)}</span><span class="tip-share">${percent(share)}</span></div>
    <div class="tip-row"><span>访客 <b>${uv}</b></span><span>浏览 <b>${pv}</b></span></div>
    <p class="tip-sub">${spots ? `覆盖 ${spots} 个城市点` : "暂无城市坐标（只到省/国家级）"}</p>
  </div>`;
}

interface TipParams {
  componentType?: string;
  name?: string;
  value?: unknown;
  data?: { spot?: MapSpot } | null;
}

function buildOption(scope: Scope, data: VisitorMapData, geo: MapGeoJson, palette: Palette): EChartsCoreOption {
  const nameByKey = new Map<string, string>();
  const keyByName = new Map<string, string>();
  for (const feature of geo.features ?? []) {
    const { name, key } = geoFeatureKeys(scope, feature.properties ?? {});
    if (!name || !key) continue;
    if (!nameByKey.has(key)) nameByKey.set(key, name);
    keyByName.set(name, key);
  }

  const regions = scope === "china" ? data.china : data.world;
  const regionByName = new Map(regions.map((region) => [nameByKey.get(region.name) ?? region.name, region]));
  const regionData = regions.map((region) => ({ name: nameByKey.get(region.name) ?? region.name, value: region.pv }));
  const located = Math.max(data.located, 1);

  // 中国视图只画国内点（geo 不裁剪，境外的点会漂在海上）
  const plotted = scope === "china" ? data.spots.filter((spot) => spot.countryIso === "CN") : data.spots;
  const spotData = plotted.map((spot) => ({
    name: spot.name,
    value: [spot.lon, spot.lat, spot.pv],
    spot,
  }));

  return {
    backgroundColor: "transparent",
    animationDuration: 400,
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "transparent",
      borderWidth: 0,
      padding: 0,
      extraCssText: "box-shadow:none;background:transparent;",
      formatter: (params: TipParams | TipParams[]) => {
        const item = Array.isArray(params) ? params[0] : params;
        if (!item) return "";
        if (item.data?.spot) return spotTip(item.data.spot);
        const name = String(item.name ?? "");
        const region = regionByName.get(name);
        if (!region) return name ? escapeHtml(name) : "";
        return regionTip(name, region.pv, region.uv, region.spots, region.pv / located);
      },
    },
    visualMap: {
      type: "continuous",
      // 只做视觉映射，不画色带（ECharts 的色带在暗色面板上偏亮，与本站风格不合）
      show: false,
      min: 0,
      max: data.maxRegionPv,
      calculable: false,
      inRange: {
        color: [
          withAlpha(palette.primary, 0.12),
          withAlpha(palette.primary, 0.2),
          withAlpha(palette.primary, 0.42),
          withAlpha(palette.primary, 0.68),
          palette.primary,
        ],
      },
    },
    geo: {
      map: scope,
      roam: true,
      zoom: scope === "china" ? 1.02 : 1,
      boundingCoords: scope === "china" ? [[73, 54], [135, 18]] : undefined,
      scaleLimit: { min: 0.8, max: 10 },
      itemStyle: {
        areaColor: withAlpha(palette.foreground, 0.04),
        borderColor: withAlpha(palette.foreground, 0.18),
        borderWidth: 0.6,
      },
      emphasis: { itemStyle: { areaColor: withAlpha(palette.primary, 0.26) }, label: { show: false } },
      select: { disabled: true },
      label: { show: false },
    },
    series: [
      {
        id: "regions",
        type: "map",
        map: scope,
        geoIndex: 0,
        data: regionData,
        select: { disabled: true },
        emphasis: { label: { show: false } },
      },
      {
        id: "visitors",
        type: "scatter",
        coordinateSystem: "geo",
        geoIndex: 0,
        z: 12,
        data: spotData,
        symbol: "circle",
        symbolSize: (value: unknown) => {
          const pv = Array.isArray(value) ? Number(value[2] ?? 1) : 1;
          return Math.min(28, 7 + Math.sqrt(Math.max(pv, 1)) * 3);
        },
        itemStyle: {
          color: palette.primary,
          borderColor: withAlpha("#ffffff", 0.6),
          borderWidth: 1,
          shadowBlur: 10,
          shadowColor: withAlpha(palette.primary, 0.5),
        },
        emphasis: { scale: 1.3 },
        label: { show: false },
      },
    ],
  };
}

function PillGroup<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border/60 p-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            value === item.id
              ? "bg-primary/15 font-medium text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function VisitorMap({ data, className }: { data: Record<MapRange, VisitorMapData>; className?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [range, setRange] = useState<MapRange>("30d");
  const [scope, setScope] = useState<Scope>(() => (data["30d"].china.length ? "china" : "world"));
  const map = data[range];
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [themeTick, setThemeTick] = useState(0);

  // 深浅色 / 面板风格切换（html 或 body 的 class 变化）→ 重绘换色
  useEffect(() => {
    const bump = () => setThemeTick((n) => n + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    void (async () => {
      try {
        const [geo, core] = await Promise.all([loadMapJson(scope), loadEcharts()]);
        if (cancelled) return;
        core.registerMap(scope, geo as unknown as Parameters<typeof core.registerMap>[1]);
        const chart = chartRef.current ?? core.init(box, undefined, { renderer: "canvas" });
        chartRef.current = chart;
        chart.setOption(buildOption(scope, map, geo, readPalette()), true);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, map, themeTick]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => chartRef.current?.resize());
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    [],
  );

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (map.spots.length) parts.push(`${map.spots.length} 个城市点`);
    if (scope === "china" ? map.china.length : map.world.length) {
      parts.push(scope === "china" ? `${map.china.length} 个省份有访客` : `${map.world.length} 个国家和地区`);
    }
    parts.push(`已定位 ${map.located} 次浏览`);
    if (map.unknown) parts.push(`未定位 ${map.unknown}`);
    return parts.join(" · ");
  }, [map, scope]);

  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <PillGroup items={SCOPES} value={scope} onChange={setScope} />
        <PillGroup items={RANGES} value={range} onChange={setRange} />
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-accent/10">
        <div ref={boxRef} className="h-[380px] w-full sm:h-[440px]" />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
            <p className="text-xs text-muted-foreground">
              {status === "error" ? `地图加载失败：${error ?? "未知错误"}` : "正在加载地图…"}
            </p>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        圆点 = 访客所在城市（大小按浏览量），省份/国家底色越深访客越多；可滚轮缩放、拖动，鼠标停留看概览
      </p>
    </div>
  );
}
