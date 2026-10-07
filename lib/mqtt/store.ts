import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DEFAULT_MQTT, sanitizeMqttConfig, sanitizeMqttConfigDetailed, type MqttConfig } from "./types";

/**
 * MQTT 配置与 retained 快照的存储。
 * 读写都在 data/（gitignore、随备份），配置读取带 mtime/size 签名缓存——
 * 所以在网页上改账号后，broker **不需要重启**即可生效（authenticate 每次都读最新配置）。
 */

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "mqtt.json");
const RETAINED_FILE = path.join(DATA_DIR, "mqtt-retained.json");

function signature(file: string): string {
  try {
    const st = fs.statSync(file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

// ── 配置（mqtt.json） ──

let configCache: MqttConfig | null = null;
let configSignature = "";
let configCheckedAt = 0;
/** 非空 = 上次从磁盘读取时发生了降级（文件损坏/账号被忽略）；此时**禁止写回**，避免把坏的默认值覆盖到磁盘 */
let configDegraded = "";
let configDegradedLoggedFor = "";

/** 两次检查磁盘的最短间隔（账号改动最多延迟这么久生效，避免每条消息都 stat） */
const RECHECK_MS = 2000;

/** 没有配置文件时的默认值：允许用环境变量设定（首次部署方便） */
function envDefaults(): MqttConfig {
  const port = Number.parseInt(process.env.MQTT_PORT ?? "", 10);
  const wsPort = Number.parseInt(process.env.MQTT_WS_PORT ?? "", 10);
  const enabled = process.env.MQTT_ENABLED;
  const wsEnabled = process.env.MQTT_WS_ENABLED;
  const okPort = (value: number, fallback: number) =>
    Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : fallback;
  return {
    ...DEFAULT_MQTT,
    enabled: enabled === undefined ? DEFAULT_MQTT.enabled : enabled !== "0" && enabled !== "false",
    port: okPort(port, DEFAULT_MQTT.port),
    wsEnabled: wsEnabled === undefined ? DEFAULT_MQTT.wsEnabled : wsEnabled !== "0" && wsEnabled !== "false",
    wsPort: okPort(wsPort, DEFAULT_MQTT.wsPort),
    wsPath: (process.env.MQTT_WS_PATH ?? "").startsWith("/") ? process.env.MQTT_WS_PATH! : DEFAULT_MQTT.wsPath,
    accounts: [],
  };
}

/** 从磁盘加载配置：文件不存在算正常，损坏则降级并记下原因（降级时禁止写回） */
function loadConfigFromDisk(): { config: MqttConfig; degraded: string } {
  let text: string;
  try {
    text = fs.readFileSync(CONFIG_FILE, "utf8");
  } catch {
    return { config: envDefaults(), degraded: "" };
  }
  try {
    const { config, note } = sanitizeMqttConfigDetailed(JSON.parse(text) as unknown);
    return { config, degraded: note };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { config: envDefaults(), degraded: `JSON 解析失败（${message}）` };
  }
}

/** 读取配置（带签名缓存；文件被外部改动会自动重载） */
export function readMqttConfig(): MqttConfig {
  const now = Date.now();
  if (configCache && now - configCheckedAt < RECHECK_MS) return configCache;
  configCheckedAt = now;
  const sig = signature(CONFIG_FILE);
  if (configCache && sig === configSignature) return configCache;
  const { config, degraded } = loadConfigFromDisk();
  configCache = config;
  configSignature = sig;
  configDegraded = degraded;
  if (degraded && configDegradedLoggedFor !== sig) {
    configDegradedLoggedFor = sig;
    console.error(
      `[mqtt] ${CONFIG_FILE} 读取异常：${degraded}。为避免覆盖现有数据，已阻止写入配置（请人工检查该文件）`,
    );
  }
  return config;
}

/** 配置的健康状态：非空表示文件有问题（写入已被阻止），面板会显示这条提示 */
export function mqttConfigWarning(): string {
  readMqttConfig();
  return configDegraded;
}

export function writeMqttConfig(config: MqttConfig): void {
  const clean = sanitizeMqttConfig(config);
  writeAtomic(CONFIG_FILE, `${JSON.stringify(clean, null, 2)}\n`);
  configCache = clean;
  configSignature = signature(CONFIG_FILE);
  configCheckedAt = Date.now();
  configDegraded = "";
  configDegradedLoggedFor = "";
}

/**
 * 不可变地更新配置。
 * ⚠️ 若上次读取时文件是损坏的（降级到默认值），这里**拒绝写入**——
 * 否则「设备断开时落盘发布数」之类的小更新会把损坏读取出来的空账号写回磁盘，账号就彻底没了。
 */
export function updateMqttConfig(mutate: (draft: MqttConfig) => void): MqttConfig {
  readMqttConfig();
  if (configDegraded) {
    console.error(`[mqtt] 已阻止写入 ${CONFIG_FILE}：${configDegraded}（请先人工修复该文件）`);
    return readMqttConfig();
  }
  const draft = structuredClone(readMqttConfig());
  mutate(draft);
  writeMqttConfig(draft);
  return readMqttConfig();
}

// ── 账号密码（scrypt） ──

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const useSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, useSalt, 32).toString("hex");
  return { salt: useSalt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  try {
    const candidate = scryptSync(password, salt, 32);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** 生成好念又足够强的随机密码（页面只显示一次） */
export function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12)}`;
}

export function newAccountId(): string {
  return randomUUID().slice(0, 8);
}

// ── retained 快照（mqtt-retained.json） ──

export interface RetainedEntry {
  topic: string;
  payload: string;
  qos: number;
  at: string;
}

export function readRetained(): RetainedEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(RETAINED_FILE, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RetainedEntry =>
        !!item &&
        typeof (item as RetainedEntry).topic === "string" &&
        typeof (item as RetainedEntry).payload === "string",
    );
  } catch {
    return [];
  }
}

export function writeRetained(entries: RetainedEntry[]): void {
  writeAtomic(RETAINED_FILE, `${JSON.stringify(entries, null, 2)}\n`);
}
