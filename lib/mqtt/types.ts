import { z } from "zod";

/** 默认监听端口（刻意选不常用端口，避免被扫） */
export const DEFAULT_MQTT_PORT = 18830;

/** 默认 WebSocket 端口（公网机 Caddy 反代 wss 用） */
export const DEFAULT_MQTT_WS_PORT = 18831;

/** 默认 wss 路径（公网机 Caddy handle 的路径） */
export const DEFAULT_MQTT_WS_PATH = "/mqtt-ws";

/** 主题根命名空间 */
export const TOPIC_ROOT = "wgl";

/** 账号允许的主题前缀（支持 # / + 通配） */
const prefixSchema = z.string().max(200).regex(/^[A-Za-z0-9_\-/#+.]*$/, "前缀只能是字母数字与 _-/#+. ");

export const mqttAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1).max(64),
  /** scrypt 派生：salt / hash 均为 hex */
  salt: z.string().min(1),
  hash: z.string().min(1),
  /** 允许读写的主题前缀，留空 = 只允许自己的 wgl/<用户名>/# */
  prefix: z.string().max(200).default(""),
  note: z.string().max(200).default(""),
  /** 绑定的 OTA 项目名（设备问 wgl/<设备>/ota 时回复该项目的固件信息） */
  otaProject: z.string().max(64).default(""),
  /** 允许发布/订阅任意主题（不限制前缀；仅建议给测试账号用） */
  allowAnyTopic: z.boolean().default(false),
  enabled: z.boolean().default(true),
  createdAt: z.string().min(1),
  lastSeenAt: z.string().optional(),
  /** 累计发布消息数（按连接断开时落盘） */
  published: z.number().int().nonnegative().default(0),
});

export const mqttConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().min(1024).max(65535).default(DEFAULT_MQTT_PORT),
  /** 是否开启 WebSocket 监听（给设备用 wss://域名/… 连，需公网机 Caddy 反代） */
  wsEnabled: z.boolean().default(true),
  wsPort: z.number().int().min(1024).max(65535).default(DEFAULT_MQTT_WS_PORT),
  /** 公网反代的 wss 路径（要与公网机 Caddy 里 handle 的路径一致，broker 本身不校验路径） */
  wsPath: z.string().max(120).regex(/^\/[A-Za-z0-9_\-./]*$/, "路径要以 / 开头").default(DEFAULT_MQTT_WS_PATH),
  /** 数值历史：每主题保留点数 */
  historyPoints: z.number().int().min(60).max(2000).default(240),
  /** 数值历史：最多跟踪的主题数 */
  historyTopics: z.number().int().min(5).max(200).default(40),
  accounts: z.array(mqttAccountSchema).default([]),
});

export type MqttAccount = z.infer<typeof mqttAccountSchema>;
export type MqttConfig = z.infer<typeof mqttConfigSchema>;

export const DEFAULT_MQTT: MqttConfig = {
  enabled: true,
  port: DEFAULT_MQTT_PORT,
  wsEnabled: true,
  wsPort: DEFAULT_MQTT_WS_PORT,
  wsPath: DEFAULT_MQTT_WS_PATH,
  historyPoints: 240,
  historyTopics: 40,
  accounts: [],
};

/** 用户名 → 默认主题前缀（wgl/<规范化用户名>/） */
export function defaultPrefix(username: string): string {
  const slug = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
  return `${TOPIC_ROOT}/${slug || "device"}/`;
}

/** 逐个校验账号：单个坏账号只会被忽略，不会连累整个配置文件 */
export function sanitizeAccounts(input: unknown): { accounts: MqttAccount[]; dropped: number } {
  if (!Array.isArray(input)) return { accounts: [], dropped: 0 };
  const accounts: MqttAccount[] = [];
  let dropped = 0;
  for (const item of input) {
    const parsed = mqttAccountSchema.safeParse(item);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const account = parsed.data;
    accounts.push({
      ...account,
      prefix: prefixSchema.safeParse(account.prefix).success ? account.prefix : defaultPrefix(account.username),
    });
  }
  return { accounts, dropped };
}

export interface SanitizeMqttResult {
  config: MqttConfig;
  /** 非空 = 有数据被降级处理（应告警，而不是静默把结果写回磁盘） */
  note: string;
}

/**
 * 规范化输入配置（坏数据兜底，永不抛）。
 * 注意：**不能**因为某个字段坏了就清空账号——账号丢了无法恢复（只有 scrypt 哈希），
 * 所以这里逐项兜底：顶层字段各自取默认值、账号逐条校验、能救多少救多少。
 */
export function sanitizeMqttConfigDetailed(input: unknown): SanitizeMqttResult {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const { accounts, dropped } = sanitizeAccounts(source.accounts);

  const parsed = mqttConfigSchema.safeParse({ ...source, accounts });
  const bool = (value: unknown, fallback: boolean): boolean => {
    const result = z.boolean().safeParse(value);
    return result.success ? result.data : fallback;
  };
  const intIn = (value: unknown, min: number, max: number, fallback: number): number => {
    const result = z.number().int().min(min).max(max).safeParse(value);
    return result.success ? result.data : fallback;
  };
  const pathIn = (value: unknown, fallback: string): string => {
    const result = z
      .string()
      .max(120)
      .regex(/^\/[A-Za-z0-9_\-./]*$/)
      .safeParse(value);
    return result.success ? result.data : fallback;
  };
  const config: MqttConfig = parsed.success
    ? { ...parsed.data, accounts }
    : {
        enabled: bool(source.enabled, DEFAULT_MQTT.enabled),
        port: intIn(source.port, 1024, 65535, DEFAULT_MQTT.port),
        wsEnabled: bool(source.wsEnabled, DEFAULT_MQTT.wsEnabled),
        wsPort: intIn(source.wsPort, 1024, 65535, DEFAULT_MQTT.wsPort),
        wsPath: pathIn(source.wsPath, DEFAULT_MQTT.wsPath),
        historyPoints: intIn(source.historyPoints, 60, 2000, DEFAULT_MQTT.historyPoints),
        historyTopics: intIn(source.historyTopics, 5, 200, DEFAULT_MQTT.historyTopics),
        accounts,
      };

  const notes: string[] = [];
  if (!parsed.success) notes.push("部分设置项不合法，已用默认值");
  if (dropped > 0) notes.push(`${dropped} 个账号数据不合法被忽略`);
  if (!Array.isArray(source.accounts) && source.accounts !== undefined) notes.push("accounts 字段不是数组，已按空处理");
  return { config, note: notes.join("；") };
}

/** 规范化输入配置（坏数据兜底，永不抛） */
export function sanitizeMqttConfig(input: unknown): MqttConfig {
  return sanitizeMqttConfigDetailed(input).config;
}
