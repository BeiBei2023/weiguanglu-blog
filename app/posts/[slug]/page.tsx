import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock, FileText, Sparkles } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown/render";
import { ArticleContent } from "@/components/post/article-content";
import { Comments } from "@/components/post/comments";
import { ViewCounter } from "@/components/post/view-counter";
import { FloatingToc } from "@/components/post/floating-toc";
import { ShareButton } from "@/components/post/share-button";
import { getViews } from "@/lib/views";
import {
  getAdjacentPosts,
  getPostBySlug,
  getReadablePost,
  getReadingPosts,
  getRelatedPosts,
  getSeriesPosts,
} from "@/lib/content";
import { getServerSession } from "@/lib/auth/server";
import { Sidebar, sidebarWidthVars } from "@/components/layout/sidebar";
import { SidebarColumn } from "@/components/layout/sidebar-column";
import { SeriesRail } from "@/components/post/series-rail";
import { getSiteConfig } from "@/lib/site-config";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** 时间戳 → 本地 YYYY-MM-DD */
function ymd(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 正文里的第一张图（Markdown 语法）→ 绝对 URL；找不到时返回 null（分享缩略图用） */
function firstImage(markdown: string): string | null {
  const match = markdown.match(/!\[[^\]]*\]\(\s*([^)\s]+)/);
  if (!match) return null;
  const src = match[1].replace(/^<|>$/g, "");
  if (/^https?:\/\//i.test(src)) return src;
  return `${site.url}${src.startsWith("/") ? "" : "/"}${src}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const session = await getServerSession();
  // 登录后可以直接打开草稿看正文预览（阅读区依旧不收录草稿）
  const post =
    getReadablePost(slug, Boolean(session)) ?? (session ? getPostBySlug(slug) : undefined);
  if (!post) return { title: "文章未找到" };
  const url = `/posts/${post.slug}`;
  const ogImage = firstImage(post.content) ?? `${site.url}/posts/${post.slug}/opengraph-image`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.date || undefined,
      modifiedTime: post.updatedAt ? ymd(post.updatedAt) : undefined,
      tags: post.tags,
      images: [ogImage],
    },
  };
}

export default async function PostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const session = await getServerSession();
  const authenticated = Boolean(session);
  // 阅读区不收录草稿；但登录后可以直接打开草稿，看它发布后的样子
  const post =
    getReadablePost(slug, authenticated) ?? (authenticated ? getPostBySlug(slug) : undefined);
  if (!post) notFound();

  // 正文里的一级标题降为二级：本页已用 post.title 渲染唯一的 h1，避免一页多个 h1
  const { html, toc } = await renderMarkdown(post.content, { demoteH1: true });
  const reading = getReadingPosts(authenticated);
  const { prev, next } = getAdjacentPosts(slug, reading);
  const views = getViews(post.slug);
  const { sidebar, sidebarWidth, panelStyle, codeCollapseLines } = getSiteConfig();

  // 字数与阅读时长（按中文阅读速度约 400 字/分钟估算）
  const wordCount = post.content.replace(/\s+/g, "").length;
  const minutes = Math.max(1, Math.round(wordCount / 400));
  const updatedDate = post.updatedAt ? ymd(post.updatedAt) : "";
  const showUpdated = Boolean(updatedDate) && updatedDate !== post.date;

  // 系列导航（只统计当前身份能读到的文章，避免泄露草稿）
  const seriesPosts = post.series ? getSeriesPosts(post.series, reading) : [];
  const seriesIndex = seriesPosts.findIndex((item) => item.slug === post.slug);
  const seriesPrev = seriesIndex > 0 ? seriesPosts[seriesIndex - 1] : null;
  const seriesNext =
    seriesIndex >= 0 && seriesIndex < seriesPosts.length - 1 ? seriesPosts[seriesIndex + 1] : null;
  const navPrev = post.series ? seriesPrev : prev;
  const navNext = post.series ? seriesNext : next;

  const related = getRelatedPosts(post, reading, 3);

  // 结构化数据（搜索引擎 + AI 摘录）
  const permalink = `${site.url}/posts/${post.slug}`;
  const cover = firstImage(post.content);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date || undefined,
        dateModified: post.updatedAt
          ? new Date(post.updatedAt).toISOString()
          : post.date
            ? new Date(post.date).toISOString()
            : undefined,
        inLanguage: "zh-CN",
        author: { "@type": "Person", name: site.name },
        publisher: { "@type": "Organization", name: site.name },
        mainEntityOfPage: { "@type": "WebPage", "@id": permalink },
        keywords: post.tags.join(","),
        url: permalink,
        ...(cover ? { image: [cover] } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: site.url },
          { "@type": "ListItem", position: 2, name: post.title, item: permalink },
        ],
      },
    ],
  };

  return (
    <div
      className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,720px)_var(--sb-right)] lg:justify-center xl:grid-cols-[var(--sb-left)_minmax(0,720px)_var(--sb-right)]"
      style={sidebarWidthVars(sidebarWidth)}
    >
      <SidebarColumn side="left">
        {post.series ? (
          <SeriesRail
            name={post.series}
            posts={seriesPosts.map((item) => ({ slug: item.slug, title: item.title }))}
            currentIndex={seriesIndex}
            next={seriesNext ? { slug: seriesNext.slug, title: seriesNext.title } : null}
          />
        ) : (
          <Sidebar items={sidebar.post.left} toc={toc} />
        )}
      </SidebarColumn>
      <article className="reading-archive min-w-0 rounded-2xl border border-border/60 bg-background/75 p-5 backdrop-blur-md sm:p-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="flex items-center gap-4">
          <Link
            href="/archive"
            className="inline-flex items-center gap-2 text-[13.5px] text-muted-foreground transition-colors hover:text-primary"
          >
            <span aria-hidden className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
            </span>
            全部档案
          </Link>
          <Link
            href="/"
            className="text-[13.5px] text-muted-foreground transition-colors hover:text-primary"
          >
            返回列表
          </Link>
        </div>
        {post.visibility === "draft" && (
          <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm">
            <span className="font-medium">预览模式</span>
            <span className="text-muted-foreground">
              ：这是还没发布的草稿，只有登录后的你能看到（阅读区、RSS、站点地图都不会收录）。
            </span>
            <Link
              href={`/admin/edit/${post.slug}`}
              className="ml-2 text-primary hover:underline"
            >
              去编辑
            </Link>
          </div>
        )}
        <h1 className="mt-4 text-[27px] font-bold leading-[1.26] tracking-[-0.3px] sm:text-[38px]">
          {post.title}
        </h1>
        <div className="mt-3 mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 pb-4 text-[13.5px] tabular-nums text-muted-foreground">
          <time>{post.date}</time>
          <span className="inline-flex items-center gap-1" title="全文字数（不含空白）">
            <FileText className="size-3.5" />
            {wordCount} 字
          </span>
          <span className="inline-flex items-center gap-1" title="预计阅读时长">
            <Clock className="size-3.5" />
            约 {minutes} 分钟
          </span>
          {showUpdated && (
            <span className="tabular-nums" title="最后更新">
              更新于 {updatedDate}
            </span>
          )}
          <ViewCounter slug={post.slug} initial={views} />
          <ShareButton slug={post.slug} title={post.title} />
          {post.visibility !== "public" && (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs">
              {post.visibility === "login" ? "仅登录可见" : "草稿"}
            </span>
          )}
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/tags/${encodeURIComponent(tag)}`}
              className="text-tag hover:underline"
            >
              #{tag}
            </Link>
          ))}
        </div>

        <ArticleContent html={html} collapseLines={codeCollapseLines} />

        <FloatingToc toc={toc} />

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              相关文章
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/posts/${item.slug}`}
                    className="flex h-full flex-col gap-1 rounded-2xl border border-border/60 bg-accent/20 p-3 text-sm transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <span className="line-clamp-2 leading-snug">{item.title}</span>
                    <span className="mt-auto text-xs tabular-nums text-muted-foreground">
                      {item.date}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <hr className="my-10 border-border" />
        {post.series && (navPrev || navNext) ? (
          <p className="mb-2 text-xs text-muted-foreground">同一系列</p>
        ) : null}
        <nav className="flex justify-between gap-4 text-sm">
          <span className="min-w-0">
            {navPrev && (
              <Link
                href={`/posts/${navPrev.slug}`}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                ← {navPrev.title}
              </Link>
            )}
          </span>
          <span className="min-w-0 text-right">
            {navNext && (
              <Link
                href={`/posts/${navNext.slug}`}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                {navNext.title} →
              </Link>
            )}
          </span>
        </nav>
        {post.visibility === "public" && <Comments panelStyle={panelStyle} />}
      </article>

      <SidebarColumn side="right">
        <Sidebar items={sidebar.post.right} toc={toc} />
      </SidebarColumn>
    </div>
  );
}
