import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { HotPanel } from "@/components/hot/hot-panel";
import { HotAiPanel } from "@/components/hot/hot-ai-panel";
import { listAiReports, publicAiConfig } from "@/lib/ai";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { refreshHot } from "@/lib/hot";

export const metadata = { title: "热点信息" };
export const dynamic = "force-dynamic";

export default async function HotPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/hot");

  const data = await refreshHot();
  // AI 解读只针对「GitHub 新星」（2026-10-07 决定）：其余三路只做展示，不喂给模型
  const github = data.sources.find((source) => source.id === "github");

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <Compass className="h-5 w-5 text-primary" />
          热点信息
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          掘金 / IT之家 / 少数派 / GitHub，每小时自动更新一次；点标题跳原站。
        </p>
      </header>

      <HotAiPanel
        initialConfig={publicAiConfig()}
        initialReports={listAiReports()}
        items={(github?.items ?? []).map((item) => ({
          title: item.title,
          url: item.url,
          meta: item.meta,
          source: github?.name ?? "GitHub 新星",
        }))}
      />
      <HotPanel initial={data} />
    </div>
  );
}
