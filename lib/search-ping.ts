/**
 * 搜索引擎主动推送：IndexNow（Bing / Yandex / Seznam 等）与百度。
 *
 * 发布或更新文章后调用 —— 让搜索引擎尽快来收，而不是干等爬虫。
 * 全部 fire-and-forget：推送失败绝不影响发布本身。
 *
 * IndexNow 不需要任何账号：只要站点根目录能访问 `/<key>.txt`（内容就是 key）即可。
 * 百度需要在 `.env` 配 `BAIDU_PUSH_TOKEN`（百度站长平台 → 普通收录 → 推送接口）。
 */
import { site } from "./site";

/** IndexNow key（对应 public/<key>.txt，内容就是这串；不是密钥，公开无妨） */
export const INDEXNOW_KEY = "b7f3c9d2e5a14f6b8c0d1e2f3a4b5c6d";

function absolute(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${site.url}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** IndexNow 单次上限 10000 条 */
async function postIndexNow(urls: string[]): Promise<void> {
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(site.url).host,
        key: INDEXNOW_KEY,
        keyLocation: `${site.url}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
  } catch {
    /* 忽略 */
  }
}

/** 百度主动推送：未配 token 就跳过（一行一个 URL） */
async function postBaidu(urls: string[]): Promise<void> {
  const token = process.env.BAIDU_PUSH_TOKEN?.trim();
  if (!token) return;
  try {
    await fetch(
      `http://data.zz.baidu.com/urls?site=${encodeURIComponent(site.url)}&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: urls.join("\n"),
      },
    );
  } catch {
    /* 忽略 */
  }
}

/** 发布/更新后调用：把受影响的 URL 推给搜索引擎（不阻塞、不抛错） */
export function pingSearchEngines(paths: string[]): void {
  const urls = paths.filter(Boolean).map(absolute);
  if (urls.length === 0) return;
  void Promise.all([postIndexNow(urls), postBaidu(urls)]);
}
