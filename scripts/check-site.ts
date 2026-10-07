/**
 * 站点自检：把 sitemap 里的每个 URL + 几个关键入口挨个请求一遍，看是不是都 200
 *
 * 用法：
 *   pnpm check:site                                  # 默认查 https://www.example.com
 *   pnpm check:site -- --site=https://www.example.com
 *   pnpm check:site -- --concurrency=8                # 并发数（默认 6）
 *
 * 退出码：全部 200 → 0；有任何一个不是 200 → 1（可直接用在部署后自检 / CI）
 */
import { site as siteInfo } from "../lib/site";

const args = process.argv.slice(2);

function argValue(name: string): string | null {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const BASE = (argValue("site") ?? process.env.SITE_URL ?? siteInfo.url ?? "").replace(/\/+$/, "");
const CONCURRENCY = Math.max(1, Number(argValue("concurrency") ?? 6) || 6);
/** sitemap 之外再补几个关键入口（爬虫/阅读器/AI 会直接抓这些） */
const EXTRA = [
  "/robots.txt",
  "/rss.xml",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/opengraph-image.png",
];

interface Result {
  url: string;
  status: number;
  ms: number;
  note?: string;
}

async function collectUrls(): Promise<string[]> {
  const urls = new Set<string>([`${BASE}/`]);
  for (const path of EXTRA) urls.add(`${BASE}${path}`);
  const foreign = new Set<string>();
  try {
    const res = await fetch(`${BASE}/sitemap.xml`, { headers: { "User-Agent": "wgl-check/1.0" } });
    const xml = await res.text();
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const raw = match[1].replace(/&amp;/g, "&").trim();
      urls.add(raw);
      try {
        const host = new URL(raw).host;
        if (host !== new URL(BASE).host) foreign.add(host);
      } catch {
        // 解析不了的地址留给逐个请求时报错
      }
    }
  } catch (error) {
    console.warn(`⚠ 取 sitemap 失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (foreign.size > 0) {
    console.warn(
      `⚠ sitemap 里的地址域名是 ${[...foreign].join("、")}，与自检目标 ${new URL(BASE).host} 不一致`,
    );
    console.warn("  （本地自检时正常——sitemap 用的是 SITE_URL；线上若不一致，就是 SITE_URL 配错了）\n");
  }
  return [...urls];
}

async function check(url: string): Promise<Result> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "manual", // 重定向也当成"有问题"报出来（sitemap 里的 URL 不该跳）
      headers: { "User-Agent": "wgl-check/1.0" },
    });
    await res.body?.cancel().catch(() => undefined);
    const ms = Date.now() - started;
    const note = res.status === 200 ? undefined : res.headers.get("location") ?? undefined;
    return { url, status: res.status, ms, note };
  } catch (error) {
    return {
      url,
      status: 0,
      ms: Date.now() - started,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool(urls: string[]): Promise<Result[]> {
  const results: Result[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= urls.length) return;
      const result = await check(urls[index]);
      results.push(result);
      if (result.status !== 200) {
        console.log(`✗ ${result.status || "ERR"}  ${result.url}${result.note ? `  → ${result.note}` : ""}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  if (!BASE) {
    console.error("缺少站点地址：用 --site=https://example.com 或设置 SITE_URL");
    process.exitCode = 1;
    return;
  }
  console.log(`自检站点：${BASE}（并发 ${CONCURRENCY}）`);
  const urls = await collectUrls();
  console.log(`共 ${urls.length} 个 URL\n`);

  const started = Date.now();
  const results = await runPool(urls);
  const failed = results.filter((item) => item.status !== 200);
  const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3);
  const total = Date.now() - started;

  console.log("");
  if (failed.length === 0) {
    console.log(`✓ 全部 ${results.length} 个 URL 都是 200（耗时 ${(total / 1000).toFixed(1)}s）`);
  } else {
    console.log(`✗ ${failed.length}/${results.length} 个 URL 异常（耗时 ${(total / 1000).toFixed(1)}s）`);
  }
  console.log(
    `最慢：${slow.map((item) => `${item.status} ${item.ms}ms ${item.url}`).join(" | ")}`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

void main();
