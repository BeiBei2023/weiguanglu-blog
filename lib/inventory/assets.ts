import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * 立创物料「参考图 / 数据手册」本地化
 *
 * - 落地 `data/inventory-images`、`data/inventory-datasheets`（volume 持久化、不进 git、随备份走）
 * - 文件名 = `sha1(原始地址)` 前 20 位 + 扩展名 → 同一地址只下载一次，重复查看零请求
 * - 只允许白名单主机（防 SSRF）；单文件上限 12 MB；20s 超时
 * - 下载/写盘失败都不影响识别与页面：回退到原始地址，页面再走「按需本地化」代理
 */

export type AssetKind = "image" | "datasheet";

const DIR_NAMES: Record<AssetKind, string> = {
  image: "inventory-images",
  datasheet: "inventory-datasheets",
};

const ALLOWED_HOSTS = new Set([
  "atta.szlcsc.com",
  "alimg.szlcsc.com",
  "assets.lcsc.com",
  "image.lceda.cn",
  // 嘉立创FA机械商城的图（手动粘贴图片地址时用）
  "static.jlcfa.com",
  "assets.jlcfa.com",
]);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

/** 本地文件名白名单（同时防目录穿越） */
export const ASSET_FILE_RE = /^[a-f0-9]{20}\.(jpg|png|webp|gif|pdf)$/;

export function assetDir(kind: AssetKind): string {
  return path.join(process.cwd(), "data", DIR_NAMES[kind]);
}

export function assetContentType(file: string): string {
  return TYPE_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** 本地文件 → 站内访问地址 */
export function assetRouteUrl(kind: AssetKind, file: string): string {
  return `/api/w/inventory/asset?kind=${kind}&file=${encodeURIComponent(file)}`;
}

/** 远程地址 → 本地化入口（首次打开会自动下载并长期复用） */
export function assetProxyUrl(kind: AssetKind, remoteUrl: string): string {
  return `/api/w/inventory/asset?kind=${kind}&src=${encodeURIComponent(remoteUrl)}`;
}

export function isRemoteAsset(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isAllowedAssetUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function assetFileName(remoteUrl: string, ext: string): string {
  const hash = crypto.createHash("sha1").update(remoteUrl).digest("hex").slice(0, 20);
  return `${hash}${ext}`;
}

/** 该地址是否已下载过（按哈希前缀找） */
export function findLocalAsset(kind: AssetKind, remoteUrl: string): string | null {
  const prefix = assetFileName(remoteUrl, "");
  try {
    return fs.readdirSync(assetDir(kind)).find((name) => name.startsWith(prefix)) ?? null;
  } catch {
    return null;
  }
}

export interface LocalizeResult {
  file: string | null;
  /** 上游 HTTP 状态码（网络错误为 null），用于判断是否被限流 */
  status: number | null;
  reason: "exists" | "downloaded" | "blocked" | "failed" | "skipped";
}

/** 下载并保存（已有则直接复用），带状态与原因，供「一键本地化」判断限流 */
export async function localizeAssetDetailed(
  kind: AssetKind,
  remoteUrl: string,
): Promise<LocalizeResult> {
  const url = remoteUrl.trim();
  if (!url || !isAllowedAssetUrl(url)) return { file: null, status: null, reason: "skipped" };

  const existing = findLocalAsset(kind, url);
  if (existing) return { file: existing, status: null, reason: "exists" };

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { file: null, status: response.status, reason: "blocked" };
    }
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return { file: null, status: response.status, reason: "failed" };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return { file: null, status: response.status, reason: "failed" };
    }

    const dir = assetDir(kind);
    fs.mkdirSync(dir, { recursive: true });
    const file = assetFileName(url, ext);
    const target = path.join(dir, file);
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, target);
    return { file, status: response.status, reason: "downloaded" };
  } catch {
    return { file: null, status: null, reason: "failed" };
  }
}

/** 下载并保存（已有则直接复用）；返回本地文件名 */
export async function localizeAsset(kind: AssetKind, remoteUrl: string): Promise<string | null> {
  return (await localizeAssetDetailed(kind, remoteUrl)).file;
}

/** 读取本地文件（不存在返回 null） */
export function readLocalAsset(kind: AssetKind, file: string): Buffer | null {
  if (!ASSET_FILE_RE.test(file)) return null;
  try {
    return fs.readFileSync(path.join(assetDir(kind), file));
  } catch {
    return null;
  }
}

/** 统计本地化的资源数量（用于「整理数据」提示） */
export function countLocalAssets(): { images: number; datasheets: number } {
  const count = (kind: AssetKind): number => {
    try {
      return fs.readdirSync(assetDir(kind)).filter((name) => ASSET_FILE_RE.test(name)).length;
    } catch {
      return 0;
    }
  };
  return { images: count("image"), datasheets: count("datasheet") };
}

export function parseAssetKind(value: string | null): AssetKind {
  return value === "datasheet" ? "datasheet" : "image";
}
