import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { FestivalsPanel } from "@/components/festivals/festivals-panel";
import { Toaster } from "@/components/ui/sonner";
import { getServerSession } from "@/lib/auth/server";
import { activeFestivals, allFestivals, readFestivals, upcomingFestival } from "@/lib/festival";
import { getSiteConfig } from "@/lib/site-config";
import { BackToWorkbench } from "@/components/w/back-to-workbench";

export const metadata: Metadata = { title: "节日" };
export const dynamic = "force-dynamic";

export default async function FestivalsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/festivals");

  const entries = allFestivals();
  const active = activeFestivals();
  const upcoming = upcomingFestival();
  const store = readFestivals();
  const mode = getSiteConfig().festival;

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <div className="mb-2">
          <BackToWorkbench />
        </div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <PartyPopper className="h-5 w-5 text-primary" />
          节日
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          节日氛围：起止区间内每天都展示（顶部横幅 + 页脚徽标 + 粒子 + 站点图标），进度按「第 N 天 / 共 M 天」算；法定节假日的起止可一键同步国务院放假安排，调休变化时会跟着更新。
        </p>
      </header>
      <FestivalsPanel
        entries={entries}
        active={active}
        upcoming={upcoming}
        mode={mode}
        syncedYear={store.year ?? null}
      />
      <Toaster position="top-center" />
    </div>
  );
}
