import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { ViewsPanel } from "@/components/views/views-panel";
import { Toaster } from "@/components/ui/sonner";
import { getServerSession } from "@/lib/auth/server";
import { buildViewsSnapshot } from "@/lib/views-stats";
import { BackToWorkbench } from "@/components/w/back-to-workbench";

export const metadata = { title: "阅读统计" };
export const dynamic = "force-dynamic";

export default async function ViewsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/views");

  const snapshot = await buildViewsSnapshot();

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-8">
      <header>
        <div className="mb-2">
          <BackToWorkbench />
        </div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <BarChart3 className="h-5 w-5 text-primary" />
          阅读统计
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          谁在什么时候、从哪儿、用什么设备看了哪篇文章（访客均为匿名，只有你能看到这份数据）
        </p>
      </header>
      <ViewsPanel initial={snapshot} />
      <Toaster position="top-center" />
    </div>
  );
}
