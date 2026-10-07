import { redirect } from "next/navigation";
import { CloudSun } from "lucide-react";
import { WeatherPanel } from "@/components/weather/weather-panel";
import { Toaster } from "@/components/ui/sonner";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { publicWeatherSnapshot, readWeatherConfig } from "@/lib/weather";

export const metadata = { title: "天气" };
export const dynamic = "force-dynamic";

export default async function WeatherPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/weather");

  const config = readWeatherConfig();
  const snapshot = await publicWeatherSnapshot();

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <div className="mb-2">
          <BackToWorkbench />
        </div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <CloudSun className="h-5 w-5 text-primary" />
          天气
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          心知天气（Seniverse）实况 + 3 天预报，给侧栏「天气」挂件供数。私钥只存在服务器
          data/weather-config.json（不进 git、不下发给访客）；免费版只有天气现象、代码与气温，页面需标注数据来源。
        </p>
      </header>
      <WeatherPanel initialConfig={config} initialSnapshot={snapshot} />
      <Toaster position="top-center" />
    </div>
  );
}
