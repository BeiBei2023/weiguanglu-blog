import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveSiteConfig, type SiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const KEYS: (
  | "avatar"
  | "logo"
  | "logoLight"
  | "favicon"
  | "faviconDark"
  | "background"
  | "backgroundVideo"
)[] = [
  "avatar",
  "logo",
  "logoLight",
  "favicon",
  "faviconDark",
  "background",
  "backgroundVideo",
];

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Partial<SiteConfig> | null;
  if (!body) return NextResponse.json({ error: "请求格式错误" }, { status: 400 });

  const clean: Partial<SiteConfig> = {};
  for (const key of KEYS) {
    const value = body[key];
    if (typeof value === "string") clean[key] = value.trim();
  }
  if (typeof body.backgroundDim === "number" || typeof body.backgroundDim === "string") {
    clean.backgroundDim = Number(body.backgroundDim);
  }
  if (typeof body.backgroundBlur === "number" || typeof body.backgroundBlur === "string") {
    clean.backgroundBlur = Number(body.backgroundBlur);
  }
  if (body.panelStyle === "light" || body.panelStyle === "dark") {
    clean.panelStyle = body.panelStyle;
  }
  if (body.imageHotlink === "off" || body.imageHotlink === "relaxed" || body.imageHotlink === "strict") {
    clean.imageHotlink = body.imageHotlink;
  }
  if (body.sidebar && typeof body.sidebar === "object") {
    // 具体校验/清洗在 saveSiteConfig 内做
    clean.sidebar = body.sidebar as SiteConfig["sidebar"];
  }
  if (body.sidebarWidth && typeof body.sidebarWidth === "object") {
    clean.sidebarWidth = body.sidebarWidth as SiteConfig["sidebarWidth"];
  }

  const config = saveSiteConfig(clean);
  return NextResponse.json({ ok: true, config });
}
