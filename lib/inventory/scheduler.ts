import { assetRouteUrl, isRemoteAsset, localizeAssetDetailed } from "./assets";
import { mutate, readInventory } from "./store";

/**
 * 库存资源自动本地化
 *
 * 由 `instrumentation.ts` 在 Node 运行时启动：站点启动 2 分钟后先跑一次，之后每 6 小时一次。
 * 只处理「地址仍是远程」的参考图 / 数据手册（新元件在识别时就已经即时本地化了），
 * 每次最多 40 个、相邻请求间隔 ≥500ms；失败只记日志，不影响站点。
 */

const FIRST_DELAY_MS = 2 * 60 * 1000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const PER_RUN = 40;
const MIN_GAP_MS = 500;

let started = false;

interface PendingAsset {
  componentId: number;
  kind: "image" | "datasheet";
  url: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function localizePendingAssets(): Promise<void> {
  try {
    const data = await readInventory();
    const pending: PendingAsset[] = [];
    for (const component of data.components) {
      if (component.imageUrl && isRemoteAsset(component.imageUrl)) {
        pending.push({ componentId: component.id, kind: "image", url: component.imageUrl });
      }
      if (component.datasheetUrl && isRemoteAsset(component.datasheetUrl)) {
        pending.push({
          componentId: component.id,
          kind: "datasheet",
          url: component.datasheetUrl,
        });
      }
    }
    if (!pending.length) {
      console.log("[inventory] 定时本地化：没有待处理资源");
      return;
    }

    const batch = pending.slice(0, PER_RUN);
    const updates = new Map<number, { imageUrl?: string; datasheetUrl?: string }>();
    let localized = 0;
    let lastAt = 0;

    for (const item of batch) {
      const gap = MIN_GAP_MS - (Date.now() - lastAt);
      if (lastAt && gap > 0) await sleep(gap);
      const result = await localizeAssetDetailed(item.kind, item.url);
      lastAt = Date.now();
      if (!result.file) continue;
      localized += 1;
      const patch = updates.get(item.componentId) ?? {};
      if (item.kind === "image") patch.imageUrl = assetRouteUrl("image", result.file);
      else patch.datasheetUrl = assetRouteUrl("datasheet", result.file);
      updates.set(item.componentId, patch);
    }

    if (updates.size) {
      await mutate((db) => {
        for (const [id, patch] of updates) {
          const component = db.components.find((item) => item.id === id);
          if (!component) continue;
          if (patch.imageUrl) component.imageUrl = patch.imageUrl;
          if (patch.datasheetUrl) component.datasheetUrl = patch.datasheetUrl;
        }
      });
    }

    console.log(
      `[inventory] 定时本地化：本次完成 ${localized} 个，剩余 ${Math.max(pending.length - localized, 0)} 个`,
    );
  } catch (error) {
    console.error("[inventory] 定时本地化失败（站点继续运行）", error);
  }
}

export function startInventoryAssetScheduler(): void {
  if (started) return;
  started = true;
  console.log("[inventory] 定时本地化已启动（启动 2 分钟后首次执行，之后每 6 小时）");
  setTimeout(() => {
    void localizePendingAssets();
    setInterval(() => {
      void localizePendingAssets();
    }, INTERVAL_MS);
  }, FIRST_DELAY_MS);
}
