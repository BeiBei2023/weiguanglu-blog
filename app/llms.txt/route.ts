import { getPublicPosts, listSeries, getTagCounts } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * /llms.txt —— 给 AI 爬虫 / 大模型看的站点说明书（llmstxt.org 约定）
 * 纯文本 Markdown：站点是什么、有哪些栏目、文章清单（标题 + 链接 + 一句话简介）
 */
export async function GET() {
  const posts = [...getPublicPosts()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const series = listSeries(posts);
  const tags = getTagCounts(posts).slice(0, 20);

  const lines: string[] = [];

  lines.push(`# ${site.name}`, "");
  lines.push(`> ${site.slogan}`, "");
  lines.push(
    `${site.name} 是一个个人技术博客，记录嵌入式与单片机（CH32V003、ESP32 / ESP-IDF、STM32、RV1106 Luckfox）、3D 打印与 Klipper、Docker 与自托管（Homelab）、以及 Android / HarmonyOS 小项目的踩坑与总结。所有文章都是实践记录：遇到的问题、排查过程、可复制的命令与代码。`,
    "",
  );
  lines.push(`- 站点首页：${site.url}/`);
  lines.push(`- 全部文章归档：${site.url}/archive`);
  lines.push(`- 标签：${site.url}/tags`);
  if (series.length) lines.push(`- 系列/专栏：${site.url}/series`);
  lines.push(`- RSS（含全文）：${site.url}/rss.xml`);
  lines.push(`- 站点地图：${site.url}/sitemap.xml`);
  lines.push(`- 完整文章内容（Markdown 拼接）：${site.url}/llms-full.txt`);
  lines.push(`- 关于我：${site.url}/about`);
  lines.push("");

  if (series.length) {
    lines.push("## 系列/专栏", "");
    for (const item of series) {
      lines.push(`- ${item.name}（${item.count} 篇）：${site.url}/series/${encodeURIComponent(item.name)}`);
    }
    lines.push("");
  }

  if (tags.length) {
    lines.push("## 常用标签", "");
    lines.push(
      tags.map((tag) => `[${tag.tag}](${site.url}/tags/${encodeURIComponent(tag.tag)})`).join("、"),
      "",
    );
  }

  lines.push("## 文章", "");
  for (const post of posts) {
    const parts = [`- [${post.title}](${site.url}/posts/${post.slug})`];
    if (post.date) parts.push(`（${post.date}）`);
    if (post.description) parts.push(`：${post.description}`);
    lines.push(parts.join(""));
  }
  lines.push("");

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
