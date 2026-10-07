import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { getServerSession } from "@/lib/auth/server";
import { getSiteConfig } from "@/lib/site-config";
import { site } from "@/lib/site";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/admin");
  const { avatar } = getSiteConfig();

  return (
    <div className="admin-scope mx-auto w-full max-w-[1200px] px-4 py-8">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="glass sticky top-24 rounded-2xl p-4">
            <div className="flex items-center gap-2.5 px-1 pb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border text-primary">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <LayoutDashboard className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-heading text-sm font-semibold">
                  {site.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{session.u}
                </span>
              </span>
            </div>
            <AdminNav />
            <div className="my-3 border-t border-border" />
            <LogoutButton className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="glass sticky-bar mb-5 rounded-2xl px-3 py-2 xl:hidden">
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="flex items-center gap-2 font-heading text-sm font-semibold">
                <LayoutDashboard className="h-4 w-4 text-primary" />
                {site.name} · 管理
              </span>
              <LogoutButton className="text-xs text-muted-foreground transition-colors hover:text-foreground" />
            </div>
            <AdminNav orientation="horizontal" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
