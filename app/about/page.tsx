import { notFound } from "next/navigation";
import { Rss } from "lucide-react";
import { getPage } from "@/lib/content/pages";
import { getPublicPosts } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown/render";
import { getSiteConfig } from "@/lib/site-config";
import { site } from "@/lib/site";
import { siteAgeDays } from "@/lib/site-age";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "关于",
  description: `关于${site.name}与它的作者：记录嵌入式、硬件、开发环境等技术折腾与日常笔记，也说明这个博客是怎么做出来的。`,
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const page = getPage("about");
  if (!page) notFound();

  const { avatar } = getSiteConfig();
  const { html } = await renderMarkdown(page.content);
  const postCount = getPublicPosts().length;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8">
      <div className="rounded-2xl border border-border/60 bg-background/75 p-5 backdrop-blur-md sm:p-10">
        {/* 个人资料卡 */}
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt="头像"
              className="h-24 w-24 rounded-full border border-white/20 object-cover shadow-lg"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="font-heading text-[30px] font-semibold tracking-[-0.3px] sm:text-[36px]">{site.name}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{site.slogan}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:justify-start">
              <span>{postCount} 篇文章</span>
              {siteAgeDays() === null ? null : <span>建站 {siteAgeDays()} 天</span>}
              <span className="tabular-nums">{site.url.replace(/^https?:\/\//, "")}</span>
            </div>
            <div className="mt-4 flex items-center justify-center gap-3 sm:justify-start">
              <a
                href={`https://github.com/${site.github}`}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
              >
                {/* GitHub 品牌图标（lucide 已移除品牌图标，用官方 octicon 路径） */}
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              </a>
              <a
                href="/rss.xml"
                aria-label="RSS 订阅"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
              >
                <Rss className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="reading-doc mt-10" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
