"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server";
import {
  clearMqttCommands,
  clearMqttDenials,
  clearMqttRecent,
  clearRetained,
  disconnectAll,
  disconnectClient,
  pushOtaCommand,
  restartMqttBroker,
} from "@/lib/mqtt/broker";
import { clearMqttHistory } from "@/lib/mqtt/history";
import {
  generatePassword,
  hashPassword,
  mqttConfigWarning,
  newAccountId,
  readMqttConfig,
  updateMqttConfig,
} from "@/lib/mqtt/store";
import { DEFAULT_MQTT_PORT, DEFAULT_MQTT_WS_PATH, DEFAULT_MQTT_WS_PORT, defaultPrefix } from "@/lib/mqtt/types";

export interface MqttActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
  /** 新建 / 重置密码时返回**一次性**明文密码（之后无法再查看） */
  password?: string;
  username?: string;
  /** 出错时回填表单（React 表单 action 提交后会重置，需恢复用户输入） */
  values?: Record<string, string>;
}

const USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PREFIX_RE = /^[A-Za-z0-9_\-/#+.]{0,200}$/;

function text(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function revalidate(): void {
  revalidatePath("/w/mqtt");
}

async function guard(): Promise<MqttActionResult | null> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };
  return null;
}

/**
 * 配置文件损坏时（store 里会降级到默认值并不再写盘）提前拦下写入操作，
 * 给出人能看懂的提示，而不是「保存了但什么都没发生」。
 */
function configGuard(): MqttActionResult | null {
  const warning = mqttConfigWarning();
  if (!warning) return null;
  return {
    ok: false,
    error: `服务器上的 data/mqtt.json 有问题（${warning}），已阻止写入以免覆盖现有账号数据：请先人工检查/修复该文件`,
  };
}

const accountInputSchema = z.object({
  username: z.string().regex(USERNAME_RE, "用户名只能是字母、数字、_ 与 -（1–64 位）"),
  note: z.string().max(200).default(""),
  prefix: z.string().regex(PREFIX_RE, "主题前缀只能包含字母数字与 _-/#+.").default(""),
  otaProject: z.string().max(64).default(""),
  allowAnyTopic: z.boolean().default(false),
});

/** 新建设备账号：自动生成一次性密码 */
export async function createAccountAction(
  _prev: MqttActionResult | null,
  formData: FormData,
): Promise<MqttActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const blocked = configGuard();
  if (blocked) return blocked;

  const parsed = accountInputSchema.safeParse({
    username: text(formData.get("username")),
    note: text(formData.get("note")),
    prefix: text(formData.get("prefix")),
    otaProject: text(formData.get("otaProject")) === "none" ? "" : text(formData.get("otaProject")),
    allowAnyTopic: text(formData.get("allowAnyTopic")) === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "输入不合法",
      values: {
        username: text(formData.get("username")),
        note: text(formData.get("note")),
        prefix: text(formData.get("prefix")),
        otaProject: text(formData.get("otaProject")) === "none" ? "" : text(formData.get("otaProject")),
      },
    };
  }

  const { username, note } = parsed.data;
  const config = readMqttConfig();
  if (config.accounts.some((account) => account.username === username)) {
    return { ok: false, error: `用户名「${username}」已存在` };
  }

  const password = generatePassword();
  const { salt, hash } = hashPassword(password);
  updateMqttConfig((draft) => {
    draft.accounts.push({
      id: newAccountId(),
      username,
      salt,
      hash,
      prefix: parsed.data.prefix || defaultPrefix(username),
      note,
      otaProject: parsed.data.otaProject,
      allowAnyTopic: parsed.data.allowAnyTopic,
      enabled: true,
      createdAt: new Date().toISOString(),
      published: 0,
    });
  });

  revalidate();
  return { ok: true, username, password, notice: `账号「${username}」已创建` };
}

/** 修改账号：用户名 / 前缀 / 备注 / 启用状态 */
export async function updateAccountAction(
  _prev: MqttActionResult | null,
  formData: FormData,
): Promise<MqttActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const blocked = configGuard();
  if (blocked) return blocked;

  const id = text(formData.get("id"));
  const parsed = accountInputSchema.safeParse({
    username: text(formData.get("username")),
    note: text(formData.get("note")),
    prefix: text(formData.get("prefix")),
    otaProject: text(formData.get("otaProject")) === "none" ? "" : text(formData.get("otaProject")),
    allowAnyTopic: text(formData.get("allowAnyTopic")) === "on",
  });
  if (!id) return { ok: false, error: "缺少账号 id" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "输入不合法" };

  const enabled = text(formData.get("enabled")) === "on" || text(formData.get("enabled")) === "true";
  let missing = false;
  let duplicate = false;
  updateMqttConfig((draft) => {
    const account = draft.accounts.find((item) => item.id === id);
    if (!account) {
      missing = true;
      return;
    }
    if (
      draft.accounts.some((item) => item.id !== id && item.username === parsed.data.username)
    ) {
      duplicate = true;
      return;
    }
    account.username = parsed.data.username;
    account.prefix = parsed.data.prefix || defaultPrefix(parsed.data.username);
    account.note = parsed.data.note;
    account.otaProject = parsed.data.otaProject;
    account.allowAnyTopic = parsed.data.allowAnyTopic;
    account.enabled = enabled;
  });
  if (missing) return { ok: false, error: "账号不存在" };
  if (duplicate) return { ok: false, error: `用户名「${parsed.data.username}」已被占用` };

  revalidate();
  return { ok: true, notice: "已保存（新配置立即生效，无需重启）" };
}

/** 重置密码：返回一次性新密码 */
export async function resetPasswordAction(
  _prev: MqttActionResult | null,
  formData: FormData,
): Promise<MqttActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const blocked = configGuard();
  if (blocked) return blocked;

  const id = text(formData.get("id"));
  const password = generatePassword();
  const { salt, hash } = hashPassword(password);
  let missing = false;
  let username = "";
  updateMqttConfig((draft) => {
    const account = draft.accounts.find((item) => item.id === id);
    if (!account) {
      missing = true;
      return;
    }
    account.salt = salt;
    account.hash = hash;
    username = account.username;
  });
  if (missing) return { ok: false, error: "账号不存在" };

  revalidate();
  return { ok: true, username, password, notice: `已重置「${username}」的密码` };
}

/** 删除账号（并踢掉它当前的连接） */
export async function deleteAccountAction(
  _prev: MqttActionResult | null,
  formData: FormData,
): Promise<MqttActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const blocked = configGuard();
  if (blocked) return blocked;

  const id = text(formData.get("id"));
  let username = "";
  updateMqttConfig((draft) => {
    const account = draft.accounts.find((item) => item.id === id);
    if (account) username = account.username;
    draft.accounts = draft.accounts.filter((item) => item.id !== id);
  });

  revalidate();
  return { ok: true, notice: username ? `已删除「${username}」（其连接已断开）` : "已删除" };
}

/** 保存开关与端口（会重启 broker） */
export async function saveSettingsAction(
  _prev: MqttActionResult | null,
  formData: FormData,
): Promise<MqttActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const blocked = configGuard();
  if (blocked) return blocked;

  const enabled = text(formData.get("enabled")) === "on";
  const portRaw = Number.parseInt(text(formData.get("port")) || String(DEFAULT_MQTT_PORT), 10);
  if (!Number.isInteger(portRaw) || portRaw < 1024 || portRaw > 65535) {
    return { ok: false, error: "端口需在 1024–65535 之间" };
  }
  const wsEnabled = text(formData.get("wsEnabled")) === "on";
  const wsPortRaw = Number.parseInt(text(formData.get("wsPort")) || String(DEFAULT_MQTT_WS_PORT), 10);
  if (!Number.isInteger(wsPortRaw) || wsPortRaw < 1024 || wsPortRaw > 65535) {
    return { ok: false, error: "WebSocket 端口需在 1024–65535 之间" };
  }
  if (wsEnabled && wsPortRaw === portRaw) {
    return { ok: false, error: "MQTT 端口与 WebSocket 端口不能相同" };
  }
  const wsPath = text(formData.get("wsPath")) || DEFAULT_MQTT_WS_PATH;
  if (!/^\/[A-Za-z0-9_\-./]*$/.test(wsPath)) {
    return { ok: false, error: "wss 路径要以 / 开头，只能用字母数字与 _-./" };
  }

  updateMqttConfig((draft) => {
    draft.enabled = enabled;
    draft.port = portRaw;
    draft.wsEnabled = wsEnabled;
    draft.wsPort = wsPortRaw;
    draft.wsPath = wsPath;
  });
  await restartMqttBroker();

  revalidate();
  return {
    ok: true,
    notice: enabled
      ? `已启用：MQTT ${portRaw}${wsEnabled ? ` · WebSocket ${wsPortRaw}` : ""}`
      : "已停用 broker",
  };
}

/** 清除某个 retained 主题（表单直接调用） */
export async function clearRetainedAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  const topic = text(formData.get("topic"));
  if (topic) clearRetained(topic);
  revalidate();
}

/** 断开某个在线客户端（表单直接调用） */
export async function disconnectClientAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  const clientId = text(formData.get("clientId"));
  if (clientId) disconnectClient(clientId);
  revalidate();
}

/** 断开全部在线设备（表单直接调用） */
export async function disconnectAllAction(): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  disconnectAll();
  revalidate();
}

/** 清空最近消息（表单直接调用） */
export async function clearRecentAction(): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  clearMqttRecent();
  revalidate();
}

/** 清空数值历史（表单直接调用） */
export async function clearHistoryAction(): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  clearMqttHistory();
  revalidate();
}

/** 通知设备检查 OTA 升级 */
export async function pushOtaAction(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  const username = text(formData.get("username"));
  if (username) pushOtaCommand(username);
  revalidate();
}

/** 清空被拦截记录（表单直接调用） */
export async function clearDenialsAction(): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  clearMqttDenials();
  revalidate();
}

/** 清空命令记录 */
export async function clearCommandsAction(): Promise<void> {
  const session = await getServerSession();
  if (!session) return;
  clearMqttCommands();
  revalidate();
}
