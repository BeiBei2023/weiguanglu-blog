import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const DOC_DIR = path.join(ROOT, "原稿归档");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const IMAGES_DIR = path.join(ROOT, "content", "images");

type Mig = {
  file: string;
  slug: string;
  tags: string[];
  /** 可选：覆盖标题 / 描述 */
  title?: string;
  desc?: string;
};

// ── 本轮新增文章（Hexo 导出）──
const MIGRATIONS: Mig[] = [
  { file: "CH32V003F4U开发前的初始配置.md", slug: "ch32v003f4u", tags: ["ch32v003", "嵌入式", "环境配置"] },
  { file: "CH32V003的GPIO库相关函数解释.md", slug: "ch32v003-gpio", tags: ["ch32v003", "嵌入式", "gpio"] },
  { file: "STM32F1添加虚拟串口VPC使用（基于STM32F103RTC6开发）.md", slug: "stm32-vpc-stm32f103rtc6", tags: ["stm32", "虚拟串口", "嵌入式"] },
  { file: "WSL结合ESP-IDF插件开发时的串口共享设置.md", slug: "wsl-esp-idf", tags: ["wsl", "esp-idf", "嵌入式"] },
  { file: "使用EEZ-Studio加速完成ESP32的LVGL开发（无flow版本）.md", slug: "eez-studio-esp32-lvgl", tags: ["esp32", "lvgl", "eez-studio", "ui"] },
  { file: "内网_Gitea_通过_FRP_公网访问配置教程（SSH_+_HTTP）.md", slug: "gitea-frp-public-access", tags: ["gitea", "frp", "内网穿透", "运维"] },
  { file: "分布式采集网关程序编写记录-基于ESP32S3和CH390H（Distributed_Collector_Gateway）.md", slug: "esp32s3-ch390h-distributed-collector-gateway", tags: ["esp32s3", "ch390h", "以太网", "网关"] },
  { file: "单台_Linux_设备，为多用户环境配置个性化主机名显示.md", slug: "linux-per-user-hostname", tags: ["linux", "shell", "运维"] },
  { file: "在CH32V003中配置按键库MultiButton.md", slug: "ch32v003-multibutton", tags: ["ch32v003", "multibutton", "嵌入式"] },
  { file: "在ESP32中使用RTC+SNTP实现多闹钟系统（基于_ESP-IDF_5.0+）.md", slug: "esp32-rtc-clock", tags: ["esp32", "esp-idf", "rtc", "sntp"] },
  { file: "在ESP32中使用SNTP进行网络时间的同步（IDF版本_v5.5.1）.md", slug: "esp32-sntp", tags: ["esp32", "esp-idf", "sntp"] },
  { file: "在STM32F1中使用easylogger实现日志打印(基于虚拟串口).md", slug: "stm32f1-easylogger", tags: ["stm32", "easylogger", "日志"] },
  { file: "在_ESP-IDF_项目中快速接入_console_simple_init（实践记录）.md", slug: "esp-idf-console-simple-init", tags: ["esp-idf", "console", "嵌入式"] },
  { file: "大夏龙雀DX-WF24驱动调试（基于STM32F1使用MQTT）.md", slug: "dx-wf24-stm32f1-mqtt", tags: ["stm32", "mqtt", "wifi", "dx-wf24"] },
  { file: "嫌录入太烦？我用_3_天做了个本地_AI_电子元器件库存管理系统.md", slug: "local-ai-electronic-component-inventory-system", tags: ["ai", "库存系统", "工具"] },
  { file: "调试Ebyte的E108-GN03（定位模块）记录.md", slug: "ebyte-e108-gn03", tags: ["gnss", "定位", "嵌入式"] },
  { file: "银达尔_M100M-C2_（AT固件版本）发送短信的使用记录.md", slug: "m100m-c2-at", tags: ["at指令", "短信", "物联网"] },
  { file: "DX-CT511N调试记录.md", slug: "dx-ct511n", tags: ["at指令", "gnss", "cat1", "物联网"], title: "DX-CT511N 调试记录" },
  { file: "Dockerfile和Docker-Compose手把手教学.md", slug: "docker-docker-compose-tutorial", tags: ["docker", "docker-compose", "运维"] },
  { file: "我在_ESP32-C3_上做了一个可落地的_Wi-Fi_配网组件.md", slug: "esp32-c3-wifi-provisioning", tags: ["esp32c3", "wifi", "配网"] },
  { file: "自己搭一个 ESP32 OTA 升级服务器——从原理到部署，附完整源码解析.md", slug: "esp32-ota-server", tags: ["esp32", "ota", "服务器"] },
];

const FENCE = /^\s*(```|~~~)/;
const IMG_HOST_RE = /123pan\.cn|123clouddisk\.com/i;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return localDate(value);
  }
  const s = String(value ?? "").replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function clip(text: string, max = 100): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function cleanInline(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function firstParagraph(body: string): string {
  let inFence = false;
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith("|") || t.startsWith("![") || t.startsWith("---") || t.startsWith("<")) continue;
    const text = cleanInline(t.replace(/^>\s?/, ""));
    if (!text) continue;
    return text.length > 100 ? text.slice(0, 100) + "…" : text;
  }
  return "";
}

/** 取正文第一处 H1（跳过代码围栏）；返回标题并移除该行 */
function extractH1(body: string): { title: string | null; body: string } {
  const lines = body.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#\s+\S/.test(lines[i])) {
      const title = cleanInline(lines[i].replace(/^#\s+/, ""));
      lines.splice(i, 1);
      return { title, body: lines.join("\n") };
    }
  }
  return { title: null, body };
}

async function downloadImages(
  body: string,
  slug: string,
): Promise<{ body: string; downloaded: number; failed: string[] }> {
  const re = /https?:\/\/[\w.-]+\/[^\s)\]"'<>]+/g;
  const urls = [...new Set(body.match(re) ?? [])].filter((u) => IMG_HOST_RE.test(u));
  const map = new Map<string, string>();
  const failed: string[] = [];
  let downloaded = 0;

  let i = 0;
  for (const url of urls) {
    i += 1;
    const ext = (url.match(/\.(png|jpe?g|gif|webp|svg)(?:$|[?#])/i)?.[1] ?? "png").toLowerCase();
    const name = `${slug}-${String(i).padStart(2, "0")}.${ext}`;
    const dest = path.join(IMAGES_DIR, name);
    try {
      if (fs.existsSync(dest)) {
        map.set(url, `/content-images/${name}`);
        console.log(`  image skip ${name} (exists)`);
        continue;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      map.set(url, `/content-images/${name}`);
      downloaded += 1;
      console.log(`  image ok  ${name}  (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed.push(url);
      console.log(`  image FAIL ${url} (${(e as Error).message})`);
    }
  }

  let out = body.replace(
    /\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g,
    (m, alt: string, u1: string, u2: string) => {
      const local = map.get(u1) ?? map.get(u2);
      return local ? `![${alt}](${local})` : m;
    },
  );
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, u: string) => {
    const local = map.get(u);
    return local ? `![${alt}](${local})` : m;
  });

  return { body: out, downloaded, failed };
}

async function main() {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const mig of MIGRATIONS) {
    const src = path.join(DOC_DIR, mig.file);
    if (!fs.existsSync(src)) {
      console.log(`SKIP (not found): ${mig.file}`);
      continue;
    }
    if (fs.statSync(src).size === 0) {
      console.log(`SKIP (empty): ${mig.file}`);
      continue;
    }

    const raw = stripBom(fs.readFileSync(src, "utf8"));
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;

    const fmTitle = fm.title ? String(fm.title) : null;
    let body = parsed.content;
    let title: string;
    if (mig.title) {
      title = mig.title;
    } else if (fmTitle) {
      title = fmTitle;
    } else {
      const r = extractH1(body);
      title = r.title ?? path.basename(mig.file, ".md");
      body = r.body;
    }

    const date = formatDate(fm.date) || localDate(fs.statSync(src).mtime);
    const tags = mig.tags.length ? mig.tags : normalizeTags(fm.tags);
    const sourceDesc =
      (typeof fm.description === "string" && fm.description) ||
      (typeof fm.abstract === "string" && fm.abstract) ||
      (typeof fm.summary === "string" && fm.summary) ||
      "";

    const { body: finalBody, downloaded, failed } = await downloadImages(body, mig.slug);
    const description =
      mig.desc ?? (sourceDesc ? clip(cleanInline(sourceDesc)) : firstParagraph(finalBody));

    const output = matter.stringify(finalBody.trimStart(), {
      title,
      date,
      tags,
      description,
      visibility: "public",
    });
    fs.writeFileSync(path.join(POSTS_DIR, `${mig.slug}.md`), output, "utf8");

    console.log(
      `\n✔ ${mig.slug}.md\n  title=${title}\n  date=${date}  tags=[${tags.join(", ")}]\n  desc=${description || "(空)"}\n  images=${downloaded}${failed.length ? `  failed=${failed.length}` : ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
