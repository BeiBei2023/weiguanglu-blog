import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSession } from "@/lib/auth/server";
import { getActiveInfo, getHistory, isValidProject, listProjects } from "@/lib/ota";
import { OtaManager } from "@/components/ota/ota-manager";
import { Cpu } from "lucide-react";
import { BackToWorkbench } from "@/components/w/back-to-workbench";

export const metadata = { title: "ESP32 OTA 升级" };
export const dynamic = "force-dynamic";

type Search = Promise<{ p?: string }>;

export default async function OtaPage({ searchParams }: { searchParams: Search }) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/ota");

  const { p } = await searchParams;
  const projects = listProjects();
  const selected =
    p && isValidProject(p) && projects.includes(p) ? p : (projects[0] ?? null);
  const active = selected ? getActiveInfo(selected) : null;
  const history = selected ? getHistory(selected) : [];

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <Cpu className="h-5 w-5 text-primary" />
          ESP32 OTA 升级
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传固件、管理版本；设备按 URL 自动拉取升级。
        </p>
      </header>
      <OtaManager
        projects={projects}
        selected={selected}
        active={active}
        history={history}
        baseUrl={baseUrl}
      />
    </div>
  );
}
