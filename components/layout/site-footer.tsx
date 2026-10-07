import Link from "next/link";
import { site } from "@/lib/site";
import { SiteAge } from "@/components/layout/site-age";
import { FestivalBadge } from "@/components/festival/festival-badge";

export function SiteFooter() {
  return (
    <footer className="px-4 pb-6 pt-10">
      <div className="mx-auto flex max-w-[1000px] flex-col items-center gap-3">
        {/* 法律与站点信息单独一行：比混在版权行里更容易被找到 */}
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-center text-sm text-foreground/80">
          <Link href="/disclaimer" className="transition-colors hover:text-primary">
            免责声明
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-primary">
            隐私政策
          </Link>
          <Link href="/opensource" className="transition-colors hover:text-primary">
            开源说明
          </Link>
          <Link href="/about" className="transition-colors hover:text-primary">
            关于
          </Link>
          <Link href="/links" className="transition-colors hover:text-primary">
            友链
          </Link>
        </nav>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <SiteAge />
          {site.icp.text ? (
            <a
              href={site.icp.href}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              {site.icp.text}
            </a>
          ) : null}
          {site.police.text ? (
            <a
              href={site.police.href}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              {site.police.text}
            </a>
          ) : null}
          <a
            href={`https://nipw.cn/ipv6webcheck/?site=${site.url.replace(/^https?:\/\//, "")}`}
            title="本站支持 IPv6 访问"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center opacity-80 transition-opacity hover:opacity-100"
          >
            {/* 徽标图存在本站 public/，访客不请求第三方；点进去才是 nipw.cn 的检测页 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ipv6-badge.svg" alt="本站支持 IPv6 访问" className="h-5 w-auto" />
          </a>
          {/* 节日徽标：节日当天出现（粒子/光晕在 app/layout.tsx 里） */}
          <FestivalBadge />
        </div>
      </div>
    </footer>
  );
}
