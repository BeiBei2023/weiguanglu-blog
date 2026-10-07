import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const IMAGES_DIR = path.join(process.cwd(), "content", "images");
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 60 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
};

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function uniqueName(ext: string): string {
  const now = new Date();
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 8);
  return `${date}-${time}-${rand}.${ext}`;
}

/** 文件名主干：只留字母数字与 . _ -，去掉扩展名与开头的点 */
function sanitizeStem(input: string): string {
  return input
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-+$/, "")
    .slice(0, 60);
}

/** 重名时自动加 -1、-2… */
function freeName(stem: string, ext: string): string {
  let name = `${stem}.${ext}`;
  for (let i = 1; fs.existsSync(path.join(IMAGES_DIR, name)) && i < 500; i += 1) {
    name = `${stem}-${i}.${ext}`;
  }
  return name;
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return NextResponse.json({ error: "只接受图片或视频文件" }, { status: 400 });
  }
  const isVideo = file.type.startsWith("video/");
  const limit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > limit) {
    return NextResponse.json(
      { error: `${isVideo ? "视频" : "图片"}过大（上限 ${isVideo ? "60MB" : "10MB"}）` },
      { status: 400 },
    );
  }

  const ext = EXT_BY_TYPE[file.type] ?? "png";
  const prefixRaw = form?.get("prefix");
  const prefix = typeof prefixRaw === "string" ? sanitizeStem(prefixRaw) : "";
  const defaultStem = uniqueName(ext).replace(/\.[A-Za-z0-9]+$/, "");
  const keepStem = sanitizeStem(file.name) || "file";
  const stem = `${prefix ? `${prefix}-` : ""}${form?.get("keepName") === "1" ? keepStem : defaultStem}`;
  const name = freeName(stem, ext);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMAGES_DIR, name), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ name, path: `/content-images/${name}` });
}
