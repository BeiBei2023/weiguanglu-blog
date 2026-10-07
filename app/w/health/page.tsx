import { redirect } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { HealthPanel } from "@/components/health/health-panel";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { readHealthSamples } from "@/lib/health";

export const metadata = { title: "机器体检趋势" };
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/health");

  const samples = readHealthSamples();

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <HeartPulse className="h-5 w-5 text-primary" />
          机器体检趋势
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每小时自动采样一次：CPU 负载、内存、磁盘占用、CPU / 主板 / 硬盘温度与 SMART 计数（按序列号认盘）。
          {samples.length > 0
            ? `已有 ${samples.length} 个采样点。`
            : "还没有采样点（采样器每小时跑一次，也可以手动跑一次 systemctl start blog-health.service）。"}
        </p>
      </header>

      <HealthPanel samples={samples} />
    </div>
  );
}
