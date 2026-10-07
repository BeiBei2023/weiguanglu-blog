import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundVideo } from "@/components/background-video";
import { FloatingActions } from "@/components/layout/floating-actions";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { FestivalParticles } from "@/components/festival/festival-particles";
import { getSiteConfig } from "@/lib/site-config";
import { sidebarWidthVars } from "@/components/layout/sidebar";
import { resolveFestival } from "@/lib/festival";
import { site } from "@/lib/site";
import "./globals.css";

export function generateMetadata(): Metadata {
  const { favicon, faviconDark } = getSiteConfig();
  /** 节日当天把站点图标换成节日版（没有节日时用后台设置里的图标） */
  const festival = resolveFestival(getSiteConfig().festival);
  const festivalIcon = festival
    ? `/festival-icon?f=${encodeURIComponent(festival.id)}`
    : null;
  return {
    metadataBase: new URL(site.url),
    title: {
      default: site.name,
      template: `%s · ${site.name}`,
    },
    description: site.slogan,
    icons: {
      icon: [
        ...(festivalIcon ? [{ url: festivalIcon, sizes: "any" }] : []),
        { url: favicon, sizes: "any" },
        { url: faviconDark, sizes: "any", media: "(prefers-color-scheme: dark)" },
      ],
      shortcut: festivalIcon ?? favicon,
      apple: festivalIcon ?? favicon,
    },
    alternates: {
      types: { "application/rss+xml": "/rss.xml" },
    },
    verification: {
      other: {
        // 百度站长平台 HTML 标签验证（验证通过后不要删）
        "baidu-site-verification": "codeva-wpVS7Y3ZUO",
      },
    },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: site.name,
      description: site.slogan,
      url: site.url,
      locale: "zh_CN",
    },
    twitter: {
      card: "summary",
      title: site.name,
      description: site.slogan,
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { background, backgroundVideo, backgroundDim, backgroundBlur, panelStyle, sidebarWidth } =
    getSiteConfig();
  const bgFilter = backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined;
  const bgTransform = backgroundBlur > 0 ? "scale(1.06)" : undefined;
  /** 节日氛围：今天（或后台指定的节日）的主题色与粒子 */
  const festival = resolveFestival(getSiteConfig().festival);

  return (
    <html lang="zh-CN" suppressHydrationWarning className="h-full antialiased">
      <body
        className={`flex min-h-full flex-col${panelStyle === "light" ? " panel-light" : ""}`}
        style={sidebarWidthVars(sidebarWidth)}
      >
        {/* 氛围光晕（无壁纸时的深色沉浸底；节日当天换成节日色） */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-30 transition-[background] duration-1000"
          style={{
            background:
              "radial-gradient(55% 45% at 12% -5%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%), radial-gradient(45% 45% at 100% 105%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
          }}
        />
        {festival ? (
          <>
            {/* 节日光晕：叠加一层节日色，让整站氛围偏过去 */}
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 -z-30 festival-glow"
              style={
                {
                  "--festival-color": festival.color,
                } as React.CSSProperties
              }
            />
            {/* 节日粒子（客户端组件；系统「减少动态效果」时自动不渲染） */}
            <FestivalParticles effect={festival.effect} emoji={festival.emoji} color={festival.color} />
          </>
        ) : null}

        {/* 背景视频（静音循环；系统「减少动态效果」时隐藏，回落到静态背景图） */}
        <BackgroundVideo
          src={backgroundVideo || undefined}
          poster={background || undefined}
          filter={bgFilter}
          transform={bgTransform}
          hidden={!backgroundVideo}
        />

        {/* 背景图层（始终渲染，便于后台设置实时预览；无背景时隐藏） */}
        <div
          data-wgl-bg
          aria-hidden
          className="fixed inset-0 -z-20 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: background ? `url(${background})` : undefined,
            filter: bgFilter,
            transform: bgTransform,
            display: background && !backgroundVideo ? undefined : "none",
          }}
        />
        <div
          data-wgl-bg-dim
          aria-hidden
          className="fixed inset-0 -z-10"
          style={{
            /* 径向渐变：中心淡、四周深，聚焦内容区（电影感 vignette） */
            background:
              "radial-gradient(120% 90% at 50% 42%, color-mix(in oklab, var(--background) 45%, transparent) 0%, var(--background) 88%)",
            opacity: backgroundDim / 100,
            display: background || backgroundVideo ? undefined : "none",
          }}
        />

        {/* 站点级结构化数据：WebSite + Person（Person 关联 GitHub，利于搜索结果识别站点） */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: site.name,
                url: site.url,
                inLanguage: "zh-CN",
              },
              {
                "@context": "https://schema.org",
                "@type": "Person",
                name: site.name,
                url: site.url,
                ...(site.github ? { sameAs: [`https://github.com/${site.github}`] } : {}),
              },
            ]),
          }}
        />

        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <SiteHeader />
          <main className="flex-1 animate-in fade-in duration-500">
            {children}
          </main>
          <SiteFooter />
          <FloatingActions />
        </ThemeProvider>
      </body>
    </html>
  );
}
