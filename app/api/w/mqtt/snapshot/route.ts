import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
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

export const dynamic = "force-dynamic";

/** 工作台 MQTT 面板的实时快照（前端每 2 秒拉一次） */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const config = readMqttConfig();
  return NextResponse.json({
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
    /** 非空 = data/mqtt.json 有问题（读取降级、写入已被阻止），面板显示红色提示条 */
    configWarning: mqttConfigWarning(),
    accounts: config.accounts.map(({ id, username, prefix, note, otaProject, allowAnyTopic, enabled, createdAt, lastSeenAt, published }) => ({
      id,
      username,
      prefix,
      note,
      otaProject,
      allowAnyTopic,
      enabled,
      createdAt,
      lastSeenAt: lastSeenAt ?? null,
      published,
    })),
  });
}
