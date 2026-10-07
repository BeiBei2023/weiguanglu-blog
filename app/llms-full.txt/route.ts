import { getPublicPosts } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * /llms-full.txt —— 全部文章的 Markdown 正文拼在一起
 * 给大模型一次性抓取用（对照 /llms.txt 的索引）
 */
export async function GET() {
  const posts = [...getPublicPosts()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const out: string[] = [];

  out.push(`# ${site.name} · 全部文章（Markdown）`, "");
  out.push(`> ${site.slogan}`, "");
  out.push(`站点：${site.url} · 生成时间：${new Date().toISOString()}`, "");
  out.push("---", "");

  for (const post of posts) {
    out.push(`## ${post.title}`, "");
    out.push(`- 链接：${site.url}/posts/${post.slug}`);
    if (post.date) out.push(`- 日期：${post.date}`);
    if (post.tags.length) out.push(`- 标签：${post.tags.join("、")}`);
    if (post.description) out.push(`- 摘要：${post.description}`);
    out.push("", post.content.trim(), "", "---", "");
  }

  return new Response(out.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
