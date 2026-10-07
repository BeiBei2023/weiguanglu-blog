import { redirect } from "next/navigation";
import { Radio } from "lucide-react";
import { MqttPanel, type MqttSnapshot } from "@/components/mqtt/mqtt-panel";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { Toaster } from "@/components/ui/sonner";
import { getServerSession } from "@/lib/auth/server";
import {
  mqttClients,
  mqttCommands,
  mqttDenials,
  mqttDevices,
  mqttRecent,
  mqttRetained,
  mqttStatus,
} from "@/lib/mqtt/broker";
import { listProjects } from "@/lib/ota";
import { mqttHistoryPreview, mqttHistoryTopics } from "@/lib/mqtt/history";
import { readMqttConfig, mqttConfigWarning } from "@/lib/mqtt/store";

export const metadata = { title: "MQTT 服务器" };
export const dynamic = "force-dynamic";

export default async function MqttPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/mqtt");

  const config = readMqttConfig();
  const snapshot: MqttSnapshot = {
    status: mqttStatus(),
    clients: mqttClients(),
    devices: mqttDevices(),
    retained: mqttRetained(),
    commands: mqttCommands().slice(0, 50),
    denials: mqttDenials(),
    recent: mqttRecent().slice(0, 60),
    historyTopics: mqttHistoryTopics(),
    history: mqttHistoryPreview(),
    otaProjects: listProjects(),
    configWarning: mqttConfigWarning(),
    accounts: config.accounts.map((account) => ({
      id: account.id,
      username: account.username,
      prefix: account.prefix,
      note: account.note,
      otaProject: account.otaProject ?? "",
      allowAnyTopic: account.allowAnyTopic ?? false,
      enabled: account.enabled,
      createdAt: account.createdAt,
      lastSeenAt: account.lastSeenAt ?? null,
      published: account.published,
    })),
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-8">
      <header>
        <div className="mb-2">
          <BackToWorkbench />
        </div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <Radio className="h-5 w-5 text-primary" />
          MQTT 服务器
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          MQTT 3.1.1 内嵌 broker：给设备发账号，设备连上来就能上报/接收消息
        </p>
      </header>
      <MqttPanel initial={snapshot} />
      <Toaster position="top-center" />
    </div>
  );
}
