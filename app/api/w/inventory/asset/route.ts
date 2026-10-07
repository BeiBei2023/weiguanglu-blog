import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  assetContentType,
  isAllowedAssetUrl,
  localizeAsset,
  parseAssetKind,
  readLocalAsset,
} from "@/lib/inventory/assets";

export const dynamic = "force-dynamic";

/**
 * 立创物料资源（参考图 / 数据手册）
 *
 * - `?file=<哈希文件>`：读取已本地化的文件
 * - `?src=<原始地址>`：按需本地化（首次打开即下载并长期保存）后返回
 *
 * 仅登录可用；只返回白名单主机下载来的文件，防止被当成任意文件代理。
 */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const kind = parseAssetKind(params.get("kind"));
  const fileParam = params.get("file")?.trim() ?? "";
  const src = params.get("src")?.trim() ?? "";

  let file = fileParam;
  if (!file && src) {
    // 允许把已本地化的站内地址原样传进来
    if (src.startsWith("/")) {
      const inner = src.includes("?") ? new URL(src, "https://local") : null;
      file = inner?.searchParams.get("file")?.trim() ?? "";
    } else {
      file = (await localizeAsset(kind, src)) ?? "";
    }
  }

  const buffer = file ? readLocalAsset(kind, file) : null;
  if (!buffer) {
    // 本地化失败（例如文件过大）→ 直接跳到原始地址，别让点「数据手册」的人吃 404
    if (src && !src.startsWith("/") && isAllowedAssetUrl(src)) {
      return NextResponse.redirect(src, 302);
    }
    return NextResponse.json({ error: "资源不可用" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": assetContentType(file),
      "content-length": String(buffer.byteLength),
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
