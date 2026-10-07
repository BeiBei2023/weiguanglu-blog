import {
  cacheKeyCode,
  cacheKeyItem,
  cacheKeySearch,
  readCache,
  writeCache,
} from "./lookup-cache";
import { assetRouteUrl, localizeAsset } from "./assets";

/**
 * 立创元器件识别（免密钥）
 *
 * 数据来源（均为公网可直接访问的只读接口）：
 *  1. 立创EDA 开放接口
 *     - 搜索：GET https://easyeda.com/api/eda/product/search?keyword=<关键词>&page=1&pageSize=10
 *     - 详情：GET https://easyeda.com/api/products/<立创编号>/components?version=6.4.19.5
 *  2. 立创商城商品页内嵌 __NEXT_DATA__：GET https://item.szlcsc.com/<商品ID>.html
 *
 * 一次识别最多发起 3 次请求（搜索 → 详情 → 商城页），带 12s 超时与来源容错：
 * 任一来源失败都不阻塞整体，失败原因收进 errors。
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TIMEOUT_MS = 12000;
const SEARCH_LIMIT = 10;

/** 「没有找到」类错误：路由据此返回 404 与友好提示 */
export class LookupNotFoundError extends Error {}

/** 这类来源服务端取不到（对方有反爬 / 暂未适配）：路由据此返回 422 与说明 */
export class LookupUnsupportedError extends Error {}

export interface LookupField {
  name: string;
  value: string;
}

/** 入库表单字段（已按项目既有格式约定拼好） */
export interface InventoryFillFields {
  partNo: string;
  name: string;
  specification: string;
  note: string;
  mpn: string;
  brand: string;
  packageName: string;
  category: string;
  lcscCode: string;
  lcscId: string;
  datasheetUrl: string;
  imageUrl: string;
  packType: string;
  packQty: number;
  unit: string;
  params: { name: string; value: string }[];
}

export interface LookupItem {
  /** 立创编号，如 C42411897 */
  lcscCode: string;
  /** 立创商城商品 ID，如 44398166 */
  productId: string;
  /** 型号，如 E103-RTL8189FTV */
  model: string;
  /** 品名，如 2.4GHz无线模块 */
  name: string;
  /** 品牌，如 EBYTE(亿佰特) */
  brand: string;
  /** 分类，如 WiFi模块 */
  category: string;
  /** 封装，如 SMD,12x12mm */
  packageName: string;
  /** 描述（立创商品页简介） */
  description: string;
  /** 数据手册链接 */
  datasheetUrl: string;
  /** 主图 */
  image: string;
  /** 多图 */
  images: string[];
  /** 库存（全仓） */
  stock: number | null;
  /** 单价（元） */
  price: number | null;
  /** 起订量 */
  minBuy: number | null;
  /** 最小包装，如 1000圆盘 */
  minPack: string;
  /** 编排，如 编带 */
  arrange: string;
  /** 重量（kg） */
  weight: number | null;
  /** 参数表 */
  fields: LookupField[];
  /** 入库表单字段（可直接回填） */
  form: InventoryFillFields;
  /** 数据来源 */
  sources: string[];
}

export interface LookupResult {
  query: string;
  kind: "code" | "item" | "keyword";
  items: LookupItem[];
  /** 关键词搜索的结果为简版（未取商城详情），选中后再查一次即可补全 */
  partial: boolean;
  /** 关键词放宽后实际命中的词（与输入不同时给出） */
  matchedKeyword?: string;
  /** 结果整体来自长期缓存（未请求立创） */
  cached?: boolean;
  errors: string[];
}

export const EMPTY_LOOKUP_ITEM: LookupItem = {
  lcscCode: "",
  productId: "",
  model: "",
  name: "",
  brand: "",
  category: "",
  packageName: "",
  description: "",
  datasheetUrl: "",
  image: "",
  images: [],
  stock: null,
  price: null,
  minBuy: null,
  minPack: "",
  arrange: "",
  weight: null,
  fields: [],
  form: {
    partNo: "",
    name: "",
    specification: "",
    note: "",
    mpn: "",
    brand: "",
    packageName: "",
    category: "",
    lcscCode: "",
    lcscId: "",
    datasheetUrl: "",
    imageUrl: "",
    packType: "",
    packQty: 0,
    unit: "",
    params: [],
  },
  sources: [],
};

/* ------------------------------ 基础请求 ------------------------------ */

/** 上游限速：相邻请求至少间隔 MIN_INTERVAL_MS（约 3 req/s），降低触发风控的概率 */
const MIN_INTERVAL_MS = 350;
let nextSlotAt = 0;

/** 被限流后的冷却阶梯（5s → 30s → 5min） */
const COOLDOWN_STEPS_MS = [5_000, 30_000, 300_000];
const RATE_LIMIT_STATUS = new Set([403, 429, 503]);
let cooldownLevel = 0;
let cooldownUntil = 0;

/** 上游限流（403/429/503）时抛出：路由据此返回 429 与友好提示 */
export class LookupRateLimitError extends Error {}

function cooldownRemaining(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

/** 简单节流：排队到下一个可用时间片 */
async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlotAt - now);
  nextSlotAt = Math.max(now, nextSlotAt) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function request(url: string, accept: string): Promise<Response> {
  const remaining = cooldownRemaining();
  if (remaining > 0) {
    throw new LookupRateLimitError(
      `立创可能正在限流，约 ${Math.ceil(remaining / 1000)} 秒后自动恢复`,
    );
  }
  await pace();
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (RATE_LIMIT_STATUS.has(response.status)) {
    const wait = COOLDOWN_STEPS_MS[Math.min(cooldownLevel, COOLDOWN_STEPS_MS.length - 1)];
    cooldownLevel += 1;
    cooldownUntil = Date.now() + wait;
    throw new LookupRateLimitError(
      `立创返回 HTTP ${response.status}，可能触发限流；已暂停 ${Math.round(wait / 1000)} 秒后自动重试`,
    );
  }
  if (response.ok) {
    cooldownLevel = 0;
    cooldownUntil = 0;
    return response;
  }
  throw new Error(`${new URL(url).host} 返回 HTTP ${response.status}`);
}

async function getJson<T>(url: string): Promise<T> {
  return (await request(url, "application/json, text/plain, */*")).json() as Promise<T>;
}

async function getText(url: string): Promise<string> {
  return (await request(url, "text/html, */*")).text();
}

function fail(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/* ------------------------------ 立创EDA ------------------------------ */

interface EasyedaHit {
  price?: unknown;
  stock?: unknown;
  mpn?: unknown;
  number?: unknown;
  package?: unknown;
  manufacturer?: unknown;
  image?: Array<Record<string, unknown>>;
}

interface EasyedaSearchPayload {
  result?: { total?: number; productList?: EasyedaHit[] };
}

function bestImage(entry: Record<string, unknown> | undefined): string {
  if (!entry) return "";
  return str(entry["900x900"]) || str(entry["224x224"]) || str(entry["96x96"]);
}

/** 立创EDA 按关键词/型号搜索（结果较简：编号、型号、品牌、封装、库存、单价） */
async function easyedaSearch(keyword: string): Promise<LookupItem[]> {
  const url =
    `https://easyeda.com/api/eda/product/search?keyword=${encodeURIComponent(keyword)}` +
    `&page=1&pageSize=${SEARCH_LIMIT}`;
  const payload = await getJson<EasyedaSearchPayload>(url);
  const hits = payload.result?.productList ?? [];
  return hits
    .map((hit) => {
      const tiers = Array.isArray(hit.price) ? (hit.price as unknown[]) : [];
      const firstTier = Array.isArray(tiers[0]) ? (tiers[0] as unknown[]) : [];
      return {
        ...EMPTY_LOOKUP_ITEM,
        lcscCode: str(hit.number).toUpperCase(),
        model: str(hit.mpn),
        brand: str(hit.manufacturer),
        packageName: str(hit.package),
        stock: num(hit.stock),
        price: num(firstTier[1]),
        image: bestImage(hit.image?.[0]),
        images: [bestImage(hit.image?.[0])].filter(Boolean),
        sources: ["立创EDA"],
      } satisfies LookupItem;
    })
    .filter((item) => item.lcscCode || item.model)
    .map((item) => ({ ...item, form: toInventoryFields(item) }));
}

interface EasyedaDetailPayload {
  result?: {
    title?: unknown;
    description?: unknown;
    thumb?: unknown;
    lcsc?: { id?: unknown; number?: unknown };
  };
}

/** 立创EDA 按编号取库信息（拿商品 ID、型号、缩略图） */
async function easyedaDetail(code: string): Promise<Partial<LookupItem>> {
  const url = `https://easyeda.com/api/products/${encodeURIComponent(code)}/components?version=6.4.19.5`;
  const payload = await getJson<EasyedaDetailPayload>(url);
  const result = payload.result;
  if (!result) throw new Error("立创EDA 未收录该编号");
  const title = str(result.title);
  const model = title.includes("_") ? title.slice(0, title.lastIndexOf("_")) : title;
  const thumb = str(result.thumb);
  const image = thumb ? (thumb.startsWith("//") ? `https:${thumb}` : thumb) : "";
  return {
    lcscCode: str(result.lcsc?.number).toUpperCase() || code.toUpperCase(),
    productId: str(result.lcsc?.id),
    model,
    description: str(result.description),
    image,
    images: image ? [image] : [],
  };
}

/* ------------------------------ 立创商城商品页 ------------------------------ */

interface SzlcscParam {
  parameterName?: unknown;
  parameterDetailValue?: unknown;
  parameterValue?: unknown;
}

interface SzlcscFileGroup {
  detailVOList?: Array<{ fileName?: unknown; fileUrl?: unknown }>;
}

interface SzlcscRecord {
  productId?: unknown;
  productCode?: unknown;
  productModel?: unknown;
  productName?: unknown;
  productType?: unknown;
  encapsulationModel?: unknown;
  breviaryImageUrl?: unknown;
  luceneBreviaryImageUrls?: unknown;
  remark?: unknown;
  encaptionPrice?: unknown;
  minBuyNumber?: unknown;
  productMinEncapsulationNumber?: unknown;
  productMinEncapsulationUnit?: unknown;
  productArrange?: unknown;
  productWeight?: unknown;
  stockNumber?: unknown;
  validStockNumber?: unknown;
  fileTypeVOList?: SzlcscFileGroup[];
  pdfFileDetailVO?: { fileUrl?: unknown };
}

interface SzlcscWebData {
  productRecord?: SzlcscRecord;
  paramList?: SzlcscParam[];
  brandVO?: { brandName?: unknown };
  currentCatalog?: { catalogName?: unknown };
  totalStockNumber?: unknown;
  gdWarehouseStockNumber?: unknown;
  jsWarehouseStockNumber?: unknown;
  recentlySalesCount?: unknown;
  productPdfDesc?: { productPDFDescVO?: { productIntro?: unknown } };
}

/** 立创商城商品页（品名、品牌、参数表、库存、价格、最小包装、多图、数据手册） */
async function szlcscItem(productId: string): Promise<Partial<LookupItem>> {
  const html = await getText(`https://item.szlcsc.com/${encodeURIComponent(productId)}.html`);
  // 立创工业品（MRO）等页面被阿里云 WAF 的 JS 挑战挡着：别装作没找到，直接说明
  if (/acw_sc__v2|aliyun_waf/i.test(html)) {
    throw new LookupUnsupportedError(
      "这是立创工业品（MRO）的商品页，对方有反爬（阿里云 WAF），服务端读不到数据；可以手动填写型号 / 规格，或从页面复制图片地址粘到「参考图链接」",
    );
  }
  const matched = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!matched) throw new Error("立创商城页面结构已变化");
  const parsed = JSON.parse(matched[1]) as { props?: { pageProps?: { webData?: SzlcscWebData } } };
  const web = parsed.props?.pageProps?.webData ?? {};
  const record = web.productRecord ?? {};

  const images = str(record.luceneBreviaryImageUrls)
    .split("<$>")
    .map((item) => item.trim())
    .filter(Boolean);
  const pdfFiles = (record.fileTypeVOList ?? []).flatMap((group) => group.detailVOList ?? []);
  const pdfPath =
    str(record.pdfFileDetailVO?.fileUrl) ||
    str(pdfFiles.find((file) => /\.pdf$/i.test(`${str(file.fileUrl)}${str(file.fileName)}`))?.fileUrl);
  const datasheetUrl = pdfPath
    ? `https://atta.szlcsc.com${pdfPath.startsWith("/") ? "" : "/"}${pdfPath}`
    : "";
  const fields = (web.paramList ?? [])
    .map((param) => ({
      name: str(param.parameterName),
      value: str(param.parameterDetailValue) || str(param.parameterValue),
    }))
    .filter((field) => field.name && field.value);
  const minPackNumber = str(record.productMinEncapsulationNumber);
  const minPackUnit = str(record.productMinEncapsulationUnit);
  const encaptionPrice = num(record.encaptionPrice);

  return {
    productId: str(record.productId) || productId,
    lcscCode: str(record.productCode).toUpperCase(),
    model: str(record.productModel),
    name: str(record.productName),
    brand: str(web.brandVO?.brandName),
    category: str(web.currentCatalog?.catalogName) || str(record.productType),
    packageName: str(record.encapsulationModel),
    description: str(record.remark) || str(web.productPdfDesc?.productPDFDescVO?.productIntro),
    datasheetUrl,
    image: str(record.breviaryImageUrl) || images[0] || "",
    images: images.length ? images : [str(record.breviaryImageUrl)].filter(Boolean),
    stock:
      num(web.totalStockNumber) ?? num(record.stockNumber) ?? num(record.validStockNumber) ?? null,
    price: encaptionPrice === null ? null : encaptionPrice / 1000,
    minBuy: num(record.minBuyNumber),
    minPack: `${minPackNumber}${minPackUnit}`,
    arrange: str(record.productArrange),
    weight: num(record.productWeight),
    fields,
  };
}

/* ------------------------------ 对外接口 ------------------------------ */

function parseQuery(query: string): {
  kind: "code" | "item" | "fa" | "keyword";
  code?: string;
  itemId?: string;
  keyword?: string;
} {
  const codeMatch = query.match(/\bC\d{3,}\b/i);
  const urlLike = query.match(/https?:\/\/[^\s]+/i) ?? (/\.[a-z]{2,}\//i.test(query) ? [query] : null);
  const urlText = urlLike?.[0] ?? "";
  const itemMatch =
    urlText.match(/item\.szlcsc\.com\/(?:mro\/)?(\d+)/i) ??
    urlText.match(/[?&](?:productId|itemId)=(\d+)/i);
  const itemId = itemMatch?.[1];
  const faMatch = urlText.match(/jlcfa\.com\/item\/(\d+)/i);
  if (codeMatch) return { kind: "code", code: codeMatch[0].toUpperCase(), itemId };
  if (faMatch) return { kind: "fa" };
  if (itemId) return { kind: "item", itemId };
  return { kind: "keyword", keyword: query };
}

interface LookupMeta {
  /** 是否命中缓存（未请求上游） */
  cached?: boolean;
}

/** 补齐入库表单字段（派生数据，缓存里不存） */
function withForm(item: LookupItem): LookupItem {
  return { ...item, form: toInventoryFields(item) };
}

/** 按编号 / 商品 ID 读缓存（只认有型号或品名的完整结果，避免脏数据） */
function cachedDetail(code: string, itemId: string): LookupItem | null {
  if (code) {
    const hit = readCache(cacheKeyCode(code));
    if (hit?.item && (hit.item.model || hit.item.name)) return withForm(hit.item);
  }
  if (itemId) {
    const hit = readCache(cacheKeyItem(itemId));
    if (hit?.item && (hit.item.model || hit.item.name)) return withForm(hit.item);
  }
  return null;
}

/** 写缓存（编号 + 商品 ID 双键，方便不同入口命中） */
function rememberDetail(item: LookupItem): void {
  if (item.lcscCode) writeCache(cacheKeyCode(item.lcscCode), { item });
  if (item.productId) writeCache(cacheKeyItem(item.productId), { item });
}

/** 关键词逐级放宽：整串 → 末段 → 去掉首段（模组型号常写作「模组PN-芯片MPN」，如 E103-RTL8189FTV → RTL8189FTV） */
async function searchWithFallback(
  keyword: string,
): Promise<{ items: LookupItem[]; used: string; cached: boolean }> {
  const parts = keyword.split(/[\s\-_/]+/).filter((part) => part.length >= 3);
  const attempts = Array.from(
    new Set([keyword, parts[parts.length - 1] ?? "", parts.slice(1).join("-"), parts[0] ?? ""]),
  ).filter((candidate) => candidate.length >= 3);
  for (const attempt of attempts) {
    const cacheKey = cacheKeySearch(attempt);
    const cached = readCache(cacheKey);
    if (cached?.items?.length) {
      return { items: cached.items.map(withForm), used: attempt, cached: true };
    }
    const items = await easyedaSearch(attempt);
    if (items.length) {
      writeCache(cacheKey, { items });
      return { items, used: attempt, cached: false };
    }
  }
  return { items: [], used: keyword, cached: false };
}

export async function lookup(rawQuery: string): Promise<LookupResult> {
  const query = rawQuery.trim();
  const errors: string[] = [];
  const parsed = parseQuery(query);

  if (parsed.kind === "fa") {
    throw new LookupUnsupportedError(
      "这是嘉立创FA机械商城的商品页，对方有反爬（阿里云 WAF），服务端读不到数据；可以手动填写型号 / 规格，或从页面复制图片地址粘到「参考图链接」",
    );
  }

  if (parsed.kind === "keyword") {
    try {
      const { items, used, cached } = await searchWithFallback(parsed.keyword ?? query);
      const matchedKeyword = used === (parsed.keyword ?? query) ? undefined : used;
      if (!items.length) {
        throw new LookupNotFoundError(
          `没有找到匹配「${parsed.keyword ?? query}」的型号，可换成立创编号（如 C42411897）或立创商品链接试试`,
        );
      }
      // 唯一命中时直接补全详情（多一次请求，换来完整的价格/库存/参数/数据手册）
      if (items.length === 1 && items[0].lcscCode) {
        const meta: LookupMeta = {};
        const full = await expandItem(items[0].lcscCode, items[0].productId, errors, meta);
        return {
          query,
          kind: "keyword",
          items: [full],
          partial: false,
          errors,
          matchedKeyword,
          cached: cached && Boolean(meta.cached),
        };
      }
      return { query, kind: "keyword", items, partial: true, errors, matchedKeyword, cached };
    } catch (error) {
      if (error instanceof LookupNotFoundError || error instanceof LookupRateLimitError) throw error;
      throw new Error(`搜索失败：${fail(error, "未知错误")}`);
    }
  }

  const meta: LookupMeta = {};
  const item = await expandItem(parsed.code ?? "", parsed.itemId ?? "", errors, meta);
  if (!item.lcscCode && !item.model && !item.name) {
    throw new LookupNotFoundError(errors[0] ?? "未识别到该元器件，请检查型号或编号");
  }
  return { query, kind: parsed.kind, items: [item], partial: false, errors, cached: Boolean(meta.cached) };
}

/** 合并三源数据：立创EDA 详情（型号/图/商品 ID）+ 立创商城商品页（品名/参数/库存/价格/手册） */
async function expandItem(
  code: string,
  itemId: string,
  errors: string[],
  meta: LookupMeta = {},
): Promise<LookupItem> {
  const cached = cachedDetail(code, itemId);
  if (cached) {
    meta.cached = true;
    return cached;
  }
  let base: Partial<LookupItem> = {};
  if (code) {
    try {
      base = await easyedaDetail(code);
    } catch (error) {
      if (error instanceof LookupRateLimitError || error instanceof LookupUnsupportedError) throw error;
      errors.push(`立创EDA：${fail(error, "查询失败")}`);
    }
  }

  const productId = base.productId || itemId || "";
  let detail: Partial<LookupItem> = {};
  if (productId) {
    try {
      detail = await szlcscItem(productId);
    } catch (error) {
      if (error instanceof LookupRateLimitError || error instanceof LookupUnsupportedError) throw error;
      errors.push(`立创商城：${fail(error, "查询失败")}`);
    }
  } else {
    errors.push("未能确定立创商品 ID，商城信息（价格/库存/参数）未获取");
  }

  const item: LookupItem = {
    ...EMPTY_LOOKUP_ITEM,
    ...base,
    ...detail,
    lcscCode: detail.lcscCode || base.lcscCode || "",
    productId: detail.productId || productId,
    model: detail.model || base.model || "",
    name: detail.name || "",
    image: detail.image || base.image || "",
    images: detail.images?.length ? detail.images : base.images?.length ? base.images : [],
    description: detail.description || base.description || "",
    sources: [base.lcscCode ? "立创EDA" : "", detail.lcscCode ? "立创商城" : ""].filter(Boolean),
  };

  // 商品参考图本地化：下载到 data/inventory-images（失败则保留原始地址，页面查看时再按需下载）
  if (item.image && /^https?:\/\//i.test(item.image)) {
    const file = await localizeAsset("image", item.image);
    if (file) item.image = assetRouteUrl("image", file);
  }

  const result = withForm(item);
  meta.cached = false;
  rememberDetail(result);
  return result;
}

/** 把识别结果映射为入库表单字段（遵循项目既有格式约定） */
export function toInventoryFields(item: LookupItem): InventoryFillFields {
  const partNo = (item.model || item.lcscCode).slice(0, 200);
  const name = (item.name || [item.brand, item.model].filter(Boolean).join(" ") || partNo).slice(0, 200);
  // 规格摘要沿用旧约定：品牌 / 封装 / 分类（同时这些也已拆成独立字段）
  const specification = [item.brand, item.packageName, item.category]
    .filter(Boolean)
    .join(" / ")
    .slice(0, 500);
  const packMatch = /^(\d+)\s*(.*)$/.exec(item.minPack ?? "");
  return {
    partNo,
    name,
    specification,
    // 备注留给「人写的话」：识别信息已全部结构化到下面的字段里
    note: "",
    mpn: item.model.slice(0, 200),
    brand: item.brand.slice(0, 160),
    packageName: item.packageName.slice(0, 160),
    category: item.category.slice(0, 160),
    lcscCode: item.lcscCode.slice(0, 40),
    lcscId: item.productId.slice(0, 40),
    datasheetUrl: item.datasheetUrl.slice(0, 600),
    imageUrl: item.image.slice(0, 600),
    packType: item.arrange.slice(0, 40),
    packQty: packMatch ? Number(packMatch[1]) || 0 : 0,
    unit: packMatch ? packMatch[2].trim().slice(0, 16) : "",
    params: item.fields.map((field) => ({ name: field.name.slice(0, 80), value: field.value.slice(0, 300) })),
  };
}
