import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  assetRouteUrl,
  isRemoteAsset,
  localizeAssetDetailed,
  type AssetKind,
} from "@/lib/inventory/assets";
import { mutate, readInventory } from "@/lib/inventory/store";

export const dynamic = "force-dynamic";

/** 每次请求最多处理几个元件 / 最长耗时（超出就把剩余留给下一次，可断点续传） */
const PER_STEP = 4;
const MAX_STEP_MS = 25000;
/** 相邻下载的最小间隔，别给对方压力 */
const MIN_GAP_MS = 350;

interface PendingAsset {
  componentId: number;
  kind: AssetKind;
  url: string;
}

interface StatusPayload {
  images: number;
  datasheets: number;
  total: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 全库里仍是远程地址的图片 / 数据手册 */
async function pendingAssets(): Promise<PendingAsset[]> {
  const data = await readInventory();
  const pending: PendingAsset[] = [];
  for (const component of data.components) {
    if (component.imageUrl && isRemoteAsset(component.imageUrl)) {
      pending.push({ componentId: component.id, kind: "image", url: component.imageUrl });
    }
    if (component.datasheetUrl && isRemoteAsset(component.datasheetUrl)) {
      pending.push({ componentId: component.id, kind: "datasheet", url: component.datasheetUrl });
    }
  }
  return pending;
}

function countOf(pending: PendingAsset[]): StatusPayload {
  return {
    images: pending.filter((item) => item.kind === "image").length,
    datasheets: pending.filter((item) => item.kind === "datasheet").length,
    total: pending.length,
  };
}

/** GET：还有多少资源待本地化 */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const pending = await pendingAssets();
  return NextResponse.json({ ok: true, ...countOf(pending) });
}

/** POST：下载一小批（客户端循环调用直至 remaining = 0） */
export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const all = await pendingAssets();
  if (!all.length) {
    return NextResponse.json({
      ok: true,
      downloaded: 0,
      failed: 0,
      rateLimited: false,
      remaining: 0,
      ...countOf([]),
    });
  }

  const batch = all.slice(0, PER_STEP);
  const startedAt = Date.now();
  const updates = new Map<number, { imageUrl?: string; datasheetUrl?: string }>();
  let downloaded = 0;
  let failed = 0;
  let rateLimited = false;
  let lastAt = 0;

  for (const item of batch) {
    if (Date.now() - startedAt > MAX_STEP_MS) break;
    const gap = MIN_GAP_MS - (Date.now() - lastAt);
    if (lastAt && gap > 0) await sleep(gap);

    const result = await localizeAssetDetailed(item.kind, item.url);
    lastAt = Date.now();

    if (result.file) {
      downloaded += 1;
      const patch = updates.get(item.componentId) ?? {};
      if (item.kind === "image") patch.imageUrl = assetRouteUrl("image", result.file);
      else patch.datasheetUrl = assetRouteUrl("datasheet", result.file);
      updates.set(item.componentId, patch);
    } else {
      failed += 1;
      if (
        result.reason === "blocked" &&
        (result.status === 403 || result.status === 429 || result.status === 503)
      ) {
        rateLimited = true;
        break;
      }
    }
  }

  if (updates.size) {
    await mutate((data) => {
      for (const [id, patch] of updates) {
        const component = data.components.find((item) => item.id === id);
        if (!component) continue;
        if (patch.imageUrl) component.imageUrl = patch.imageUrl;
        if (patch.datasheetUrl) component.datasheetUrl = patch.datasheetUrl;
      }
    });
  }

  const remaining = await pendingAssets();
  return NextResponse.json({
    ok: true,
    downloaded,
    failed,
    rateLimited,
    remaining: remaining.length,
    ...countOf(remaining),
  });
}
