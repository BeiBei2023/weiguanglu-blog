import { Settings } from "lucide-react";
import { SiteSettingsForm } from "@/components/admin/site-settings-form";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export const metadata = { title: "设置" };

export default function AdminSettingsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <Settings className="h-5 w-5 text-primary" />
          站点设置
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">图片、背景、面板风格与侧栏布局</p>
      </header>
      <SiteSettingsForm initial={getSiteConfig()} />
    </div>
  );
}
