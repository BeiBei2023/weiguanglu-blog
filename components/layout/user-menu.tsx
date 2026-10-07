"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LayoutGrid, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ avatar, username }: { avatar: string; username: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="账户菜单"
          title={username}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-44">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin" className="flex cursor-pointer items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            管理
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/w" className="flex cursor-pointer items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            工作站
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void handleLogout();
          }}
          className="flex cursor-pointer items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
