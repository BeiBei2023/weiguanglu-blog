/**
 * 地图名称工具（服务端 / 客户端都能用，不能引 node 内置模块）。
 *
 * 访客地图有两份底图：中国省级地图（DataV GeoJSON）与自然地球世界地图。
 * 统计端按「省短名 / 国家两位代码」聚合，这里负责把 GeoJSON 的要素名对齐到同一套键。
 */

/** 中国省级名去掉后缀：广西壮族自治区 → 广西、内蒙古自治区 → 内蒙古、香港特别行政区 → 香港 */
export function cnRegionShort(name: string): string {
  return name.replace(/(维吾尔|壮族|回族)?(自治区|特别行政区|省|市)$/, "").trim();
}

export interface GeoFeatureKeys {
  /** 底图上的显示名（与 GeoJSON 里的名称一致） */
  name: string;
  /** 与统计数据对齐的键：中国地图 = 省短名；世界地图 = 国家两位代码（大写） */
  key: string;
}

/** 从 GeoJSON Feature 的 properties 里取「显示名 + 匹配键」 */
export function geoFeatureKeys(scope: "china" | "world", props: Record<string, unknown>): GeoFeatureKeys {
  const name = typeof props.name === "string" ? props.name : "";
  if (scope === "china") return { name, key: cnRegionShort(name) };
  const raw = typeof props.iso2 === "string" ? props.iso2 : "";
  const iso = raw && raw !== "-99" ? raw.toUpperCase() : "";
  return { name, key: iso };
}
