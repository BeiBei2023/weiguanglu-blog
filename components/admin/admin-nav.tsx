"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BarChart3, FileText, Home, LayoutGrid, Plus, Settings } from "lucide-react";
import { cn } from "cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN: NavItem[] = [
  { href: "/admin", label: "文章列表", icon: FileText },
  { href: "/admin/new", label: "新建文章", icon: Plus },
  { href: "/admin/settings", label: "站点设置", icon: Settings },
];

const SITE: NavItem[] = [
  { href: "/", label: "回站点", icon: Home },
  { href: "/w", label: "工作站", icon: LayoutGrid },
  { href: "/w/views", label: "阅读统计", icon: BarChart3 },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/edit");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({
  items,
  pathname,
  horizontal,
}: {
  items: NavItem[];
  pathname: string;
  horizontal?: boolean;
}) {
  return (
    <ul className={horizontal ? "flex flex-wrap items-center gap-1" : "space-y-1"}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                horizontal
                  ? "rounded-full border"
                  : "rounded-xl",
                active
                  ? "border-primary/50 bg-primary/12 font-medium text-primary"
                  : horizontal
                    ? "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {active && !horizontal ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                />
              ) : null}
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1.5 font-heading text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
      {children}
    </p>
  );
}

export function AdminNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const horizontal = orientation === "horizontal";
  return (
    <nav
      aria-label="管理导航"
      className={horizontal ? "flex flex-wrap items-center gap-1" : "space-y-3"}
    >
      {!horizontal ? <GroupLabel>内容</GroupLabel> : null}
      <NavList items={MAIN} pathname={pathname} horizontal={horizontal} />
      {horizontal ? <span className="mx-1 h-4 w-px bg-border" aria-hidden /> : null}
      {!horizontal ? <GroupLabel>站点</GroupLabel> : null}
      <NavList items={SITE} pathname={pathname} horizontal={horizontal} />
    </nav>
  );
}
