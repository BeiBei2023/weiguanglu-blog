/**
 * 把站点 URL 主动推送给搜索引擎（百度主动推送 + IndexNow）。
 *
 * 用法（在仓库根目录）：
 *   pnpm push:search                # 推送最近更新的 20 篇文章 + 首页/标签/友链等
 *   pnpm push:search -- --all       # 推送全部公开文章
 *   pnpm push:search -- --limit=50  # 指定条数
 *   pnpm push:search -- --dry       # 只打印要推送的 URL，不发请求
 *   pnpm push:search -- --indexnow  # 同时推 IndexNow（Bing / Yandex 等）
 *   pnpm push:search -- --site=https://www.example.com   # 覆盖站点域名
 *
 * 百度准入密钥：环境变量 BAIDU_TOKEN 优先，其次用下面的默认值（可在 .env.local 里覆盖）。
 * IndexNow 密钥：环境变量 INDEXNOW_KEY 优先，默认用 Bing Webmaster Tools 签发的密钥
 * （文件名必须等于密钥本身，内容也是密钥）。
 */
import fs from "node:fs";
import path from "node:path";
import { getPublicPosts } from "../lib/content";
import { site } from "../lib/site";

const BAIDU_ENDPOINT = "http://data.zz.baidu.com/urls";
/** 百度搜索资源平台 → 普通收录 → 推送接口的准入密钥 */
const BAIDU_TOKEN = process.env.BAIDU_TOKEN ?? "pZrLuI2hAN0TsY7n";
/** IndexNow 密钥（同时是 public 下的文件名）。推荐用 Bing Webmaster Tools 签发的 key，并用环境变量覆盖 */
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "7387c201cd6f4824bdbab1a0fe84757d";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** 百度每次请求推送的 URL 条数（分批发，额度用完能及时停下） */
const BAIDU_CHUNK = 10;

interface Args {
  all: boolean;
  limit: number;
  dry: boolean;
  indexnow: boolean;
  site: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.some((arg) => arg === `--${name}`);
  const value = (name: string, fallback: string) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const limit = Number(value("limit", "20"));
  return {
    all: flag("all"),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20,
    dry: flag("dry"),
    indexnow: flag("indexnow"),
    site: value("site", site.url).replace(/\/+$/, ""),
  };
}

/** 静态页 + 标签页 + 系列页 + 友链页（保持和 sitemap 一致的主要入口） */
function landingUrls(base: string): string[] {
  return [
    `${base}/`,
    `${base}/tags`,
    `${base}/series`,
    `${base}/archive`,
    `${base}/links`,
    `${base}/about`,
  ];
}

function articleUrls(base: string, args: Args): { url: string; updatedAt: number }[] {
  const posts = getPublicPosts().map((post) => ({
    url: `${base}/posts/${post.slug}`,
    updatedAt: post.updatedAt || 0,
  }));
  if (args.all) return posts;
  return [...posts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, args.limit);
}

async function pushBaidu(base: string, urls: string[]): Promise<void> {
  // 注意：site 参数不能再做百分号编码（百度不认 https%3A%2F%2F…，会回 400 site init fail），按文档用主机名
  const host = new URL(base).host;
  const endpoint = `${BAIDU_ENDPOINT}?site=${host}&token=${BAIDU_TOKEN}`;
  let success = 0;
  for (let i = 0; i < urls.length; i += BAIDU_CHUNK) {
    const chunk = urls.slice(i, i + BAIDU_CHUNK);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: chunk.join("\n"),
      });
      const text = await res.text();
      if (res.status === 200) {
        const data = JSON.parse(text) as { success?: number; remain?: number; not_same_site?: string[]; not_valid?: string[] };
        success += data.success ?? 0;
        console.log(
          `[百度] 本批推送 ${chunk.length} 条 → 成功 ${data.success ?? 0}，当天剩余额度 ${data.remain ?? "?"}`,
        );
        if (data.not_same_site?.length) console.log(`[百度] 非本站 URL（忽略）：${data.not_same_site.join(", ")}`);
        if (data.not_valid?.length) console.log(`[百度] 不合法 URL（忽略）：${data.not_valid.join(", ")}`);
        // 新站每天的推送额度很小（首页 + 当天新发的几条就够），额度用完就停，剩下的明天再跑
        if (typeof data.remain === "number" && data.remain <= 0) {
          console.log("[百度] 当天额度已用完 → 剩下的 URL 明天再跑一次即可（脚本可重复执行）");
          break;
        }
      } else {
        console.error(`[百度] HTTP ${res.status}：${text.slice(0, 200)}`);
      }
    } catch (error) {
      console.error(`[百度] 请求失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`[百度] 合计成功推送 ${success} 条`);
}

async function pushIndexNow(base: string, urls: string[]): Promise<void> {
  const body = {
    host: new URL(base).host,
    key: INDEXNOW_KEY,
    keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    console.log(`[IndexNow] HTTP ${res.status}${res.ok ? " ✓" : `：${(await res.text()).slice(0, 200)}`}`);
  } catch (error) {
    console.error(`[IndexNow] 请求失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.site.includes("localhost")) {
    console.error(`站点域名像本地地址（${args.site}）——请用 SITE_URL 或 --site=https://你的域名 指定`);
    process.exitCode = 1;
    return;
  }
  const [home, ...restLanding] = landingUrls(args.site);
  // 顺序 = 首页 → 最新文章 → 其它入口页：新站百度额度小，按重要性优先推
  const urls = [home, ...articleUrls(args.site, args).map((item) => item.url), ...restLanding];
  console.log(`站点：${args.site}`);
  console.log(`待推送 ${urls.length} 条：`);
  for (const url of urls) console.log(`  ${url}`);
  if (args.dry) {
    console.log("（--dry：不发请求）");
    return;
  }
  await pushBaidu(args.site, urls);
  if (args.indexnow) await pushIndexNow(args.site, urls);
  else console.log("（未推 IndexNow；加 --indexnow 可一并推给 Bing / Yandex）");
}

/** 保证 IndexNow 密钥文件存在（public/<key>.txt，内容为密钥） */
function ensureIndexNowKeyFile(): void {
  const file = path.join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`);
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, `${INDEXNOW_KEY}\n`, "utf8");
  } catch {
    // 忽略：不影响百度推送
  }
}

ensureIndexNowKeyFile();
void main();
