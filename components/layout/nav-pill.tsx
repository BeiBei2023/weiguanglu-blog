"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "cn";

/** 导航胶囊：当前页面高亮成主色浅底 */
export function NavPill({
  href,
  children,
  className,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] transition-colors sm:px-3 sm:text-sm",
        active
          ? "bg-primary/12 font-medium text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}
