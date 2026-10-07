import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { Server } from "lucide-react";
import { getServerSession } from "@/lib/auth/server";
import { sysInfo } from "@/lib/sysinfo";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { StatusPanel } from "@/components/status/status-panel";

export const metadata: Metadata = { title: "服务器状态" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/status");

  const info = await sysInfo();

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-8">
      <header>
        <div className="mb-2">
          <BackToWorkbench />
        </div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <Server className="h-5 w-5 text-primary" />
          服务器状态
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          从容器内部能看到的：磁盘、端口探活、站点自检、备份、部署记录与各模块概况。
        </p>
      </header>
      <StatusPanel initial={info} />
      <Toaster position="top-center" />
    </div>
  );
}
