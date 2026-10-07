import Link from "next/link";
import { headers } from "next/headers";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchPalette } from "@/components/search/search-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { NavPill } from "@/components/layout/nav-pill";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getServerSession } from "@/lib/auth/server";
import { getSiteConfig } from "@/lib/site-config";
import { site } from "@/lib/site";
import { WStatusStrip } from "@/components/w/status-strip";
import { cn } from "cn";

const NAV_ITEMS = [
  { href: "/tags", label: "标签" },
  { href: "/series", label: "系列" },
  { href: "/archive", label: "归档" },
  { href: "/about", label: "关于" },
];

const DRAWER_LINK =
  "flex w-full items-center rounded-xl px-3 py-2.5 text-sm whitespace-nowrap";

export async function SiteHeader() {
  const session = await getServerSession();
  const { logo, logoLight, avatar } = getSiteConfig();

  // 工作台页面（proxy.ts 会带上 x-pathname）：把机架读数条并进同一个玻璃面板，
  // 免得顶部出现「导航 + 读数条」两条。其他页面布局一行不动。
  const pathname = (await headers()).get("x-pathname") ?? "";
  const inWorkstation = pathname === "/w" || pathname.startsWith("/w/");

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div className={cn("mx-auto max-w-[1000px]", inWorkstation && "glass glass-nav rounded-2xl p-1.5")}>
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-0.5",
              inWorkstation
                ? "rounded-xl px-2 py-1"
                : "glass glass-nav rounded-full py-1.5 pl-3 pr-1.5 sm:gap-1 sm:pl-5 sm:pr-2",
            )}
          >
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 text-base font-bold tracking-tight whitespace-nowrap sm:text-lg"
            >
              {logo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo}
                    alt={site.name}
                    className="hidden h-6 w-6 rounded-md object-cover dark:block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoLight}
                    alt={site.name}
                    className="h-6 w-6 rounded-md object-cover dark:hidden"
                  />
                </>
              ) : null}
              {site.name}
            </Link>
            <span className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
            <nav className="hidden shrink-0 items-center gap-0.5 sm:flex">
              {NAV_ITEMS.map((item) => (
                <NavPill key={item.href} href={item.href}>
                  {item.label}
                </NavPill>
              ))}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1.5">
              <SearchPalette />
              <ThemeToggle />
              {session ? (
                <UserMenu avatar={avatar} username={session.u} />
              ) : (
                <NavPill href="/login" className="hidden sm:inline-flex">
                  登录
                </NavPill>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="sm:hidden"
                    aria-label="打开导航菜单"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] gap-0 p-0">
                  <SheetHeader className="border-b border-border/60">
                    <SheetTitle className="font-heading">导航</SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-1 p-3">
                    {NAV_ITEMS.map((item) => (
                      <SheetClose asChild key={item.href}>
                        <NavPill href={item.href} className={DRAWER_LINK}>
                          {item.label}
                        </NavPill>
                      </SheetClose>
                    ))}
                    {session ? (
                      <SheetClose asChild>
                        <NavPill href="/w" className={DRAWER_LINK}>
                          工作站
                        </NavPill>
                      </SheetClose>
                    ) : (
                      <SheetClose asChild>
                        <NavPill href="/login" className={DRAWER_LINK}>
                          登录
                        </NavPill>
                      </SheetClose>
                    )}
                  </nav>
                  <div className="mt-auto border-t border-border/60 p-3 text-xs text-muted-foreground">
                    {site.name}{site.slogan ? ` · ${site.slogan}` : ""}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
          {session ? (
            <div
              className={cn(
                "hidden shrink-0 items-center sm:flex",
                inWorkstation ? "rounded-xl px-1.5 py-1" : "glass glass-nav rounded-full p-1.5",
              )}
            >
              <NavPill href="/w">工作站</NavPill>
            </div>
          ) : null}
        </div>

        {inWorkstation ? (
          <div className="w-scope mt-1 border-t border-border/60 pt-1.5">
            <WStatusStrip bare />
          </div>
        ) : null}
      </div>
    </header>
  );
}
