import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const IMAGES_DIR = path.resolve(process.cwd(), "content", "images");

/** 上传接口生成的文件名（时间戳+随机），内容永不改变 → 可以长缓存 */
const UNIQUE_NAME = /^\d{8}-\d{6}-[0-9a-z]+\.[a-z0-9]+$/i;

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
};

type Policy = "off" | "relaxed" | "strict";

/** 防盗链判定：off 不拦；relaxed 只在“有外站 Referer”时拦；strict 必须本站 Referer */
function refererAllowed(request: Request, policy: Policy): boolean {
  if (policy === "off") return true;
  const referer = request.headers.get("referer");
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const extra = (process.env.IMAGE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!referer) return policy === "relaxed";
  try {
    const r = new URL(referer).host.toLowerCase();
    return r === host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(r) || extra.includes(r);
  } catch {
    return policy === "relaxed";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!refererAllowed(request, getSiteConfig().imageHotlink)) {
    return new Response("Hotlinking is not allowed", { status: 403 });
  }

  const { path: parts } = await params;
  const full = path.resolve(IMAGES_DIR, parts.join("/"));

  if (full !== IMAGES_DIR && !full.startsWith(IMAGES_DIR + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const stat = fs.statSync(full);
  const ext = path.extname(full).toLowerCase();
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    // 时间戳命名的文件内容不会变 → 浏览器缓存一年；其余（图片工具本地化的原名文件）1 小时
    "Cache-Control": UNIQUE_NAME.test(path.basename(full))
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
    Vary: "Referer",
  };

  // 命中缓存校验：直接 304，省掉整段视频/图片的重复下载
  const notModified =
    request.headers.get("if-none-match")?.split(",").some((tag) => tag.trim() === etag) ||
    (!request.headers.get("if-none-match") &&
      (() => {
        const since = request.headers.get("if-modified-since");
        return since ? Math.floor(stat.mtimeMs / 1000) * 1000 <= Date.parse(since) : false;
      })());
  if (notModified) {
    return new Response(null, { status: 304, headers });
  }

  // 支持 Range（背景视频拖动/分段加载需要）
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (Number.isFinite(start) && start <= end && start < stat.size) {
      const length = end - start + 1;
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(full, "r");
      try {
        fs.readSync(fd, buffer, 0, length, start);
      } finally {
        fs.closeSync(fd);
      }
      return new Response(new Uint8Array(buffer), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": String(length),
        },
      });
    }
  }

  // 流式返回，避免大视频一次性读进内存
  const stream = Readable.toWeb(fs.createReadStream(full)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
