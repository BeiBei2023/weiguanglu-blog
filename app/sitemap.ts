import type { MetadataRoute } from "next";
import { getPublicPosts, getTagCounts, listSeries, type Post } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** 文章的最后更新时间：优先文件修改时间，退化成发布日期 */
function postStamp(post: Post): Date {
  if (post.updatedAt) return new Date(post.updatedAt);
  return post.date ? new Date(post.date) : new Date();
}

/** 取一组时间里最新的那个（空数组时给兜底时间） */
function latest(dates: Date[], fallback: Date): Date {
  let newest = fallback;
  for (const date of dates) {
    if (!Number.isNaN(date.getTime()) && date > newest) newest = date;
  }
  return newest;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getPublicPosts();
  const stamps = new Map(posts.map((post) => [post.slug, postStamp(post)]));
  const newest = latest([...stamps.values()], new Date());

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site.url}/`, lastModified: newest, changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/tags`, lastModified: newest, changeFrequency: "weekly", priority: 0.5 },
    { url: `${site.url}/series`, lastModified: newest, changeFrequency: "weekly", priority: 0.5 },
    { url: `${site.url}/links`, lastModified: newest, changeFrequency: "monthly", priority: 0.4 },
    { url: `${site.url}/about`, lastModified: newest, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/disclaimer`, lastModified: newest, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site.url}/archive`, lastModified: newest, changeFrequency: "monthly", priority: 0.4 },
    { url: `${site.url}/opensource`, lastModified: newest, changeFrequency: "monthly", priority: 0.3 },
    { url: `${site.url}/privacy`, lastModified: newest, changeFrequency: "yearly", priority: 0.3 },
  ];

  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${site.url}/posts/${post.slug}`,
    lastModified: stamps.get(post.slug) ?? newest,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // 标签页：更新时间取该标签下最新一篇
  const tagPages: MetadataRoute.Sitemap = getTagCounts(posts).map((tag) => ({
    url: `${site.url}/tags/${encodeURIComponent(tag.tag)}`,
    lastModified: latest(
      posts.filter((post) => post.tags.includes(tag.tag)).map((post) => stamps.get(post.slug) ?? newest),
      newest,
    ),
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  // 系列页：更新时间取该系列下最新一篇
  const seriesPages: MetadataRoute.Sitemap = listSeries(posts).map((item) => ({
    url: `${site.url}/series/${encodeURIComponent(item.name)}`,
    lastModified: latest(
      item.posts.map((post) => stamps.get(post.slug) ?? newest),
      newest,
    ),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const years = new Set<string>();
  const months = new Set<string>();
  for (const post of posts) {
    if (!post.date) continue;
    const [y, m] = post.date.split("-");
    if (!y) continue;
    years.add(y);
    if (m) months.add(`${y}/${m}`);
  }
  const archivePages: MetadataRoute.Sitemap = [
    ...[...years].map((y) => ({
      url: `${site.url}/archive/${y}`,
      lastModified: newest,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    ...[...months].map((ym) => ({
      url: `${site.url}/archive/${ym}`,
      lastModified: newest,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];

  return [...staticPages, ...postPages, ...tagPages, ...seriesPages, ...archivePages];
}
