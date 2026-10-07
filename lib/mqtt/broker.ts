import { createServer, type Server } from "node:net";
import { Duplex } from "node:stream";
import { networkInterfaces } from "node:os";
import { Aedes, type Client as AedesClient } from "aedes";
import { WebSocketServer, type WebSocket } from "ws";
import { getActiveInfo, listProjects, otaTokenEnabled } from "@/lib/ota";
import { mqttHistoryTopics, recordMqttValue } from "./history";
import { readMqttConfig, updateMqttConfig, verifyPassword, writeRetained, readRetained, type RetainedEntry } from "./store";
import { TOPIC_ROOT, defaultPrefix, type MqttAccount } from "./types";

/** 命令记录保留条数 */
const COMMAND_LIMIT = 100;

/** 被拦截记录保留条数 */
const DENIAL_LIMIT = 20;

/** 这些主题是协议消息（命令/回执/状态/OTA），不当作遥测记历史 */
const PROTOCOL_TOPIC_RE = /\/(ack|reply|cmd|ota|status)$/;

/** 最近消息环形缓冲长度 */
const RECENT_LIMIT = 200;

export interface MqttRuntimeClient {
  id: string;
  username: string;
  prefix: string;
  ip: string;
  connectedAt: string;
  subscriptions: string[];
  published: number;
  lastActiveAt: string;
  /** 最后一次收到 PINGREQ 的时间（null = 一次都没收到过，说明客户端没心跳） */
  lastPingAt: string | null;
}

export interface MqttRuntimeMessage {
  at: string;
  topic: string;
  qos: number;
  retain: boolean;
  payload: string;
  clientId: string;
  /** true = 工作台/站点自己发出的 */
  fromSite: boolean;
}

/** 被 ACL 拦下的请求（最近若干条，供页面展示，方便排查设备主题写错） */
export interface MqttDenial {
  at: string;
  kind: "auth" | "publish" | "subscribe";
  username: string;
  ip: string;
  topic?: string;
  reason: string;
}

/** 工作台下发过的命令（带 ack 状态） */
export interface MqttCommandLog {
  id: string;
  at: string;
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
  /** 目标设备账号（按主题前缀反查） */
  device: string;
  /** true = 自动回复（如 OTA 询问的回复） */
  auto: boolean;
  ackedAt: string | null;
  ackPayload: string | null;
}

/** 设备总览（由账号 + retained 状态 + 在线客户端推导） */
export interface MqttDeviceView {
  username: string;
  prefix: string;
  /** 绑定的 OTA 项目（空 = 未绑定） */
  otaProject: string;
  online: boolean;
  /** retained 状态载荷（原样） */
  status: string | null;
  statusAt: string | null;
  /** 该设备最近一次上报时间 */
  lastAt: string | null;
  /** 该设备当前的数值遥测主题 */
  metrics: string[];
  published: number;
  /** 在线时的运行时信息（离线为 null），供设备卡显示 订阅/心跳/连接时长/断开 */
  runtime: {
    id: string;
    ip: string;
    connectedAt: string;
    subscriptions: string[];
    lastPingAt: string | null;
    published: number;
  } | null;
}

export interface MqttStatus {
  /** 是否已启动监听 */
  listening: boolean;
  /** 启动失败原因（端口占用等） */
  error: string | null;
  enabled: boolean;
  port: number;
  /** WebSocket 监听（wss 反代用） */
  wsEnabled: boolean;
  wsListening: boolean;
  wsPort: number;
  wsError: string | null;
  /** 公网可直接连的 wss 地址（由 SITE_URL + wsPath 推出；SITE_URL 没配则 null） */
  publicWsUrl: string | null;
  /** WebSocket 路径（内网 ws:// 与公网 wss 共用） */
  wsPath: string;
  startedAt: string | null;
  /** 可给设备用的地址（优先 EasyTier/BIND_ADDR） */
  addresses: string[];
  online: number;
  totalMessages: number;
  retained: number;
  /** 被 ACL 拦下的次数（越权发布/订阅） */
  denied: number;
}

interface MqttRuntime {
  aedes: Aedes | null;
  server: Server | null;
  /** MQTT over WebSocket 服务（给设备走 wss://域名 连） */
  wsServer: WebSocketServer | null;
  wsError: string | null;
  startedAt: number | null;
  error: string | null;
  clients: Map<string, MqttRuntimeClient>;
  /** clientId → aedes 客户端引用（用于主动断开；不进 JSON） */
  refs: Map<string, AedesClient>;
  recent: MqttRuntimeMessage[];
  retained: Map<string, RetainedEntry>;
  commands: MqttCommandLog[];
  denials: MqttDenial[];
  denied: number;
  totalMessages: number;
}

const globalRef = globalThis as unknown as { __wglMqtt?: MqttRuntime };

function runtime(): MqttRuntime {
  globalRef.__wglMqtt ??= {
    aedes: null,
    server: null,
    wsServer: null,
    wsError: null,
    startedAt: null,
    error: null,
    clients: new Map(),
    refs: new Map(),
    recent: [],
    retained: new Map(),
    commands: [],
    denials: [],
    denied: 0,
    totalMessages: 0,
  };
  return globalRef.__wglMqtt;
}

/** 按主题前缀反查设备账号 */
function accountForTopic(topic: string): MqttAccount | undefined {
  const config = readMqttConfig();
  return config.accounts.find((account) => {
    const prefix = prefixOf(account);
    return prefix && topic.startsWith(prefix);
  });
}

/**
 * OTA 联动：设备往 wgl/<设备>/ota（或 /ota/check）问一句，
 * 站点按账号绑定的 OTA 项目回复固件信息到 wgl/<设备>/ota/reply。
 */
function handleOtaRequest(topic: string): void {
  const account = accountForTopic(topic);
  const prefix = account ? prefixOf(account) : topic.slice(0, topic.lastIndexOf("/") + 1);
  const replyTopic = `${prefix}ota/reply`;

  const project = account?.otaProject?.trim() ?? "";
  if (!project || !listProjects().includes(project)) {
    publishFromSite(
      replyTopic,
      JSON.stringify({
        available: false,
        error: !account
          ? "无法识别设备账号"
          : project
            ? `OTA 项目「${project}」不存在`
            : "该账号未绑定 OTA 项目",
      }),
      { qos: 1, auto: true },
    );
    return;
  }

  const info = getActiveInfo(project);
  const base = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const path = `/api/ota/${project}/firmware.bin`;
  publishFromSite(
    replyTopic,
    JSON.stringify({
      available: Boolean(info),
      project,
      version: info?.version ?? null,
      md5: info?.md5 ?? null,
      size: info?.sizeBytes ?? null,
      sizeStr: info?.sizeStr ?? null,
      url: base ? `${base}${path}` : path,
      path,
      /** 固件接口是否要求设备令牌（true 时设备请求要带 Authorization: Bearer <OTA_TOKEN>） */
      authRequired: otaTokenEnabled(),
    }),
    { qos: 1, auto: true },
  );
}

/** 按主题前缀反查是哪个设备账号 */
function deviceNameForTopic(topic: string): string {
  return accountForTopic(topic)?.username ?? "(未知)";
}

function recordCommand(entry: Omit<MqttCommandLog, "id" | "at" | "ackedAt" | "ackPayload">): MqttCommandLog {
  const state = runtime();
  const command: MqttCommandLog = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    ackedAt: null,
    ackPayload: null,
    ...entry,
  };
  state.commands.unshift(command);
  if (state.commands.length > COMMAND_LIMIT) state.commands.length = COMMAND_LIMIT;
  return command;
}

/** 设备回了 ack：把最近一条未确认的同主题命令标记为已确认（自动回复不参与匹配） */
function markAcked(topic: string, payload: string): boolean {
  const state = runtime();
  const base = topic.replace(/\/ack$/, "");
  const device = deviceNameForTopic(topic);
  const target =
    state.commands.find((item) => !item.ackedAt && item.topic === base) ??
    state.commands.find((item) => !item.ackedAt && !item.auto && item.device === device);
  if (!target) return false;
  target.ackedAt = new Date().toISOString();
  target.ackPayload = trimPayload(payload);
  return true;
}

/** 客户端对象上挂我们自己的元数据（aedes 不提供） */
type TaggedClient = AedesClient & { wglUsername?: string; wglPrefix?: string; wglIp?: string; wglPublished?: number; wglKeepalive?: number };

function accountForClient(username: string | undefined): MqttAccount | undefined {
  if (!username) return undefined;
  return readMqttConfig().accounts.find((account) => account.username === username && account.enabled);
}

/** 允许的主题前缀：账号没配就用 wgl/<用户名>/ */
function prefixOf(account: MqttAccount): string {
  return account.prefix.trim() || defaultPrefix(account.username);
}

/** 记一条「被拦下的请求」（页面会展示，方便排查主题写错） */
function recordDenial(entry: Omit<MqttDenial, "at">): void {
  const state = runtime();
  state.denials.unshift({ at: new Date().toISOString(), ...entry });
  if (state.denials.length > DENIAL_LIMIT) state.denials.length = DENIAL_LIMIT;
}

function topicAllowed(prefix: string, topic: string, allowAny = false): boolean {
  if (allowAny) return true;
  // 显式配了 wgl/# 或 # 视为全权限
  if (prefix === "#" || prefix === `${TOPIC_ROOT}/#`) return true;
  return topic.startsWith(prefix) || prefix === "";
}

function clientIp(client: TaggedClient): string {
  const conn = client.conn as unknown as { remoteAddress?: string; socket?: { remoteAddress?: string } };
  const req = (client as unknown as {
    req?: {
      connDetails?: { ip?: string };
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    };
  }).req;
  const forwarded = req?.headers?.["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : "";
  const raw =
    conn?.remoteAddress ?? conn?.socket?.remoteAddress ?? req?.connDetails?.ip ?? req?.socket?.remoteAddress ?? forwardedIp ?? "";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function trimPayload(payload: Buffer | string | undefined): string {
  const text = typeof payload === "string" ? payload : (payload?.toString("utf8") ?? "");
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function persistRetained(): void {
  writeRetained([...runtime().retained.values()]);
}

/** 把一条 WebSocket 连接包成双工流交给 aedes（MQTT over WebSocket 桥） */
function wsToStream(socket: WebSocket): Duplex {
  const stream = new Duplex({
    read() {
      // 数据由 socket 消息驱动，这里无需主动拉取
    },
    write(chunk: Buffer, _encoding, callback) {
      if (socket.readyState !== socket.OPEN) {
        callback(new Error("WebSocket 已关闭"));
        return;
      }
      socket.send(chunk, (error) => callback(error ?? undefined));
    },
    destroy(error, callback) {
      try {
        socket.close();
      } catch {
        // 忽略重复关闭
      }
      callback(error);
    },
  });

  socket.on("message", (data, isBinary) => {
    // MQTT 控制包是二进制帧；个别客户端可能发文本帧，按 latin1 还原字节
    const buffer = isBinary
      ? Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer)
      : Buffer.from(String(data), "binary");
    stream.push(buffer);
  });
  socket.on("close", () => stream.push(null));
  socket.on("error", (error) => stream.destroy(error));

  // aedes 读 client.conn.remoteAddress 取客户端 IP；WS 包装流要自己补上
  const rawSocket = (socket as unknown as { _socket?: { remoteAddress?: string } })._socket;
  (stream as unknown as { remoteAddress?: string }).remoteAddress = rawSocket?.remoteAddress;

  return stream;
}

/** 启动 broker（幂等）。端口占用等失败只记录，不影响站点本身 */
export async function startMqttBroker(force = false): Promise<void> {
  const state = runtime();
  const config = readMqttConfig();
  if (state.aedes && !force) return;
  if (!config.enabled) return;
  if (force) await stopMqttBroker();

  const aedes = await Aedes.createBroker();

  // 记录 CONNECT 里的 keepalive（aedes 内部不暴露该值），便于排查「心跳超时」类掉线
  aedes.preConnect = (client, packet, done) => {
    (client as TaggedClient).wglKeepalive = packet.keepalive;
    done(null, true);
  };

  aedes.authenticate = (client, username, password, done) => {
    const account = accountForClient(username ?? undefined);
    const ok =
      Boolean(account) &&
      verifyPassword(password ? password.toString() : "", account!.salt, account!.hash);
    const tagged = client as TaggedClient;
    if (ok && account) {
      tagged.wglUsername = account.username;
      tagged.wglPrefix = prefixOf(account);
      tagged.wglIp = clientIp(tagged);
      tagged.wglPublished = 0;
    } else {
      state.denied += 1;
      recordDenial({
        kind: "auth",
        username: username ?? "",
        ip: clientIp(tagged),
        reason: account ? "密码不正确" : "用户名不存在或已停用",
      });
      console.warn(`[mqtt] 认证失败 user=${username ?? "(空)"} ip=${clientIp(tagged)}（${account ? "密码不正确" : "用户名不存在或已停用"}）`);
    }
    done(null, ok);
  };

  // ACL：越权发布必须用 Error 才能**真正拦住**（aedes 的 authorizePublish 只看 error 参数）；
  // 代价是违规客户端会被断开——这是 fail-closed，设备会自动重连。
  aedes.authorizePublish = (client, packet, done) => {
    const tagged = client as TaggedClient;
    const account = accountForClient(tagged.wglUsername);
    const allowAny = Boolean(account?.allowAnyTopic);
    if (!account || !topicAllowed(tagged.wglPrefix ?? "", packet.topic, allowAny)) {
      state.denied += 1;
      recordDenial({
        kind: "publish",
        username: tagged.wglUsername ?? "",
        ip: tagged.wglIp ?? "",
        topic: packet.topic,
        reason: account ? `不在前缀 ${prefixOf(account)} 内` : "账号不存在或已停用",
      });
      console.warn(
        `[mqtt] ACL 拒绝发布 user=${tagged.wglUsername ?? "?"} topic=${packet.topic}（允许前缀 ${account ? prefixOf(account) : "无"}）→ 断开该客户端`,
      );
      return done(new Error("ACL: 该主题不在你的前缀内"));
    }
    done(null);
  };

  // 订阅越权：返回非对象 → aedes 记为 granted=128（SUBACK 失败）且不建立订阅，
  // 但不会断开客户端（比 Error 友好）；实测越权方收不到任何消息。
  aedes.authorizeSubscribe = (client, sub, done) => {
    const tagged = client as TaggedClient;
    const account = accountForClient(tagged.wglUsername);
    const allowAny = Boolean(account?.allowAnyTopic);
    const cb = done as unknown as (error: Error | null, subscription?: unknown) => void;
    if (!account || !topicAllowed(tagged.wglPrefix ?? "", sub.topic, allowAny)) {
      state.denied += 1;
      recordDenial({
        kind: "subscribe",
        username: tagged.wglUsername ?? "",
        ip: tagged.wglIp ?? "",
        topic: sub.topic,
        reason: account ? `不在前缀 ${prefixOf(account)} 内` : "账号不存在或已停用",
      });
      console.warn(
        `[mqtt] ACL 拒绝订阅 user=${tagged.wglUsername ?? "?"} topic=${sub.topic}（允许前缀 ${account ? prefixOf(account) : "无"}）→ SUBACK 失败码`,
      );
      return cb(null, false);
    }
    cb(null, sub);
  };

  aedes.on("clientReady", (client) => {
    const tagged = client as TaggedClient;
    const viaWs = Boolean((client as unknown as { req?: unknown }).req);
    console.log(
      `[mqtt] 设备上线 id=${client.id} user=${tagged.wglUsername ?? "?"} ${viaWs ? "WS" : "TCP"} ip=${tagged.wglIp || clientIp(tagged) || "?"} v${client.version} keepalive=${tagged.wglKeepalive ?? "?"}s clean=${client.clean}`,
    );
    state.refs.set(client.id, client);
    state.clients.set(client.id, {
      id: client.id,
      username: tagged.wglUsername ?? "(未知)",
      prefix: tagged.wglPrefix ?? "",
      ip: tagged.wglIp ?? "",
      connectedAt: new Date().toISOString(),
      subscriptions: [],
      published: 0,
      lastActiveAt: new Date().toISOString(),
      lastPingAt: null,
    });
  });

  aedes.on("subscribe", (subscriptions, client) => {
    const entry = state.clients.get(client.id);
    console.log(`[mqtt] 订阅 id=${client.id} → ${subscriptions.map((s) => s.topic).join(", ")}`);
    if (!entry) return;
    for (const sub of subscriptions) {
      if (!entry.subscriptions.includes(sub.topic)) entry.subscriptions.push(sub.topic);
    }
  });

  aedes.on("unsubscribe", (topics, client) => {
    const entry = state.clients.get(client.id);
    if (!entry) return;
    entry.subscriptions = entry.subscriptions.filter((item) => !topics.includes(item));
  });

  const pingStats = new Map<string, { count: number; lastAt: number }>();
  aedes.on("ping", (_packet, client) => {
    const now = Date.now();
    const prev = pingStats.get(client.id);
    const gap = prev ? Math.round((now - prev.lastAt) / 1000) : 0;
    pingStats.set(client.id, { count: (prev?.count ?? 0) + 1, lastAt: now });
    const entry = state.clients.get(client.id);
    if (entry) {
      entry.lastPingAt = new Date(now).toISOString();
      entry.lastActiveAt = entry.lastPingAt;
    }
    console.log(
      `[mqtt] 心跳 #${(prev?.count ?? 0) + 1} id=${client.id}${prev ? `（距上次 ${gap}s）` : "（首个）"}`,
    );
  });

  aedes.on("publish", (packet, client) => {
    state.totalMessages += 1;
    const tagged = client as TaggedClient | null;
    if (tagged) tagged.wglPublished = (tagged.wglPublished ?? 0) + 1;

    const entry = client ? state.clients.get(client.id) : undefined;
    if (entry) {
      entry.published += 1;
      entry.lastActiveAt = new Date().toISOString();
    }

    // retained：空载荷 = 清除该主题
    if (packet.retain) {
      const payload = trimPayload(packet.payload);
      if (payload === "") state.retained.delete(packet.topic);
      else
        state.retained.set(packet.topic, {
          topic: packet.topic,
          payload,
          qos: packet.qos,
          at: new Date().toISOString(),
        });
      persistRetained();
    }

    // 数值遥测记进历史（只记设备上报的、且不是协议主题；非数值载荷会被忽略）
    if (client && !packet.retain && !PROTOCOL_TOPIC_RE.test(packet.topic)) {
      recordMqttValue(packet.topic, trimPayload(packet.payload));
    }

    // ack 回执：wgl/<设备>/cmd/ack 等
    if (client && /\/ack$/.test(packet.topic)) {
      markAcked(packet.topic, trimPayload(packet.payload));
    }

    // 站点账号（全权限前缀 #）自己发的消息也计入命令记录，方便和回执对上
    if (client && (client as TaggedClient).wglPrefix === "#") {
      recordCommand({
        topic: packet.topic,
        payload: trimPayload(packet.payload),
        qos: packet.qos,
        retain: Boolean(packet.retain),
        device: deviceNameForTopic(packet.topic),
        auto: false,
      });
    }

    // OTA 询问：wgl/<设备>/ota 或 /ota/check
    if (client && /\/ota(\/check)?$/.test(packet.topic)) {
      handleOtaRequest(packet.topic);
    }

    if (!client) return; // 站点内部回放 retained / 站点自身发布：稍后单独记入最近消息
    state.recent.unshift({
      at: new Date().toISOString(),
      topic: packet.topic,
      qos: packet.qos,
      retain: Boolean(packet.retain),
      payload: trimPayload(packet.payload),
      clientId: client.id,
      fromSite: false,
    });
    if (state.recent.length > RECENT_LIMIT) state.recent.length = RECENT_LIMIT;
  });

  aedes.on("clientDisconnect", (client) => {
    const tagged = client as TaggedClient;
    const entry = state.clients.get(client.id);
    console.log(
      `[mqtt] 设备下线 id=${client.id} user=${tagged.wglUsername ?? "?"} 发布=${entry?.published ?? 0} 订阅=${entry?.subscriptions.length ?? 0}`,
    );
    state.clients.delete(client.id);
    state.refs.delete(client.id);

    // 断开时把该设备的累计发布数与最近在线时间落盘（账号表/设备卡会显示）
    if (tagged.wglUsername) {
      const published = entry?.published ?? 0;
      const at = new Date().toISOString();
      updateMqttConfig((draft) => {
        const account = draft.accounts.find((item) => item.username === tagged.wglUsername);
        if (!account) return;
        account.published += published;
        account.lastSeenAt = at;
      });
    }
  });

  aedes.on("clientError", (client, error) => {
    console.error(`[mqtt] 客户端错误 ${client?.id ?? "?"}: ${error?.message ?? error}`);
  });

  const server = createServer(aedes.handle);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  }).then(
    () => {
      state.aedes = aedes;
      state.server = server;
      state.startedAt = Date.now();
      state.error = null;
      console.log(`[mqtt] broker 已监听 0.0.0.0:${config.port}（MQTT 3.1.1，账号 ${readMqttConfig().accounts.length} 个）`);
    },
    (error: Error) => {
      state.error = error.message;
      state.aedes = null;
      state.server = null;
      console.error(`[mqtt] 启动失败（端口 ${config.port}）：${error.message}`);
      server.close();
    },
  );

  // 回放上一次的 retained 快照
  for (const entry of readRetained()) {
    state.retained.set(entry.topic, entry);
    aedes.publish(retainedPacket(entry.topic, entry.payload), () => {});
  }

  // MQTT over WebSocket（同一 broker 实例，设备可走 wss://域名 连）
  if (config.wsEnabled) {
    try {
      const wss = new WebSocketServer({
        host: "0.0.0.0",
        port: config.wsPort,
        // MQTT over WebSocket 规范：子协议必须是 mqtt（老客户端用 mqttv3.1）
        handleProtocols: (protocols) => {
          if (protocols.has("mqtt")) return "mqtt";
          if (protocols.has("mqttv3.1")) return "mqttv3.1";
          return false;
        },
      });
      wss.on("connection", (socket, request) => {
        // 把 upgrade 请求交给 aedes：这样 client.req 有值（可区分 WS/TCP）
        aedes.handle(wsToStream(socket), request as unknown as Parameters<typeof aedes.handle>[1]);
      });
      wss.on("listening", () => {
        state.wsServer = wss;
        state.wsError = null;
        // 服务端每 30s 发一次 WS ping：让 Caddy / 隧道不要掐空闲连接
        setInterval(() => {
          for (const socket of wss.clients) {
            try {
              if (socket.readyState === socket.OPEN) socket.ping();
            } catch {
              // 忽略
            }
          }
        }, 30_000).unref?.();
        console.log(`[mqtt] WebSocket 已监听 0.0.0.0:${config.wsPort}（MQTT over WS，供公网机 Caddy 反代 wss）`);
      });
      wss.on("error", (error: Error) => {
        state.wsError = error.message;
        state.wsServer = null;
        console.error(`[mqtt] WebSocket 启动失败（端口 ${config.wsPort}）：${error.message}`);
      });
    } catch (error) {
      state.wsError = error instanceof Error ? error.message : String(error);
      console.error(`[mqtt] WebSocket 初始化失败：${state.wsError}`);
    }
  }
}

/** 构造一条 retained 包（aedes 的 publish 需要完整包结构） */
function retainedPacket(topic: string, payload: string | Buffer) {
  return {
    cmd: "publish" as const,
    topic,
    payload: typeof payload === "string" ? Buffer.from(payload) : payload,
    qos: 0 as const,
    retain: true,
    dup: false,
  };
}

export async function stopMqttBroker(): Promise<void> {
  const state = runtime();
  if (state.wsServer) {
    await new Promise<void>((resolve) => state.wsServer?.close(() => resolve()));
    state.wsServer = null;
    state.wsError = null;
  }
  if (state.server) {
    await new Promise<void>((resolve) => state.server?.close(() => resolve()));
  }
  if (state.aedes) state.aedes.close(() => {});
  state.server = null;
  state.aedes = null;
  state.startedAt = null;
  state.clients.clear();
  state.refs.clear();
}

/** 配置变更后重启（改端口 / 开关） */
export async function restartMqttBroker(): Promise<void> {
  await stopMqttBroker();
  await startMqttBroker(true);
}

/** 由 SITE_URL 与 wsPath 推出公网 wss 地址（如 wss://www.example.com/mqtt-ws） */
function publicWssUrl(path: string): string | null {
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (!site) return null;
  try {
    const url = new URL(site);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = path.startsWith("/") ? path : `/${path}`;
    url.search = "";
    url.hash = "";
    if ((url.protocol === "wss:" && url.port === "443") || (url.protocol === "ws:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** 本机可用于连接设备的地址 */
function addresses(port: number): string[] {
  const out: string[] = [];
  const bind = process.env.BIND_ADDR?.trim();
  if (bind && bind !== "127.0.0.1") out.push(`${bind}:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      const addr = `${net.address}:${port}`;
      if (!out.includes(addr)) out.push(addr);
    }
  }
  out.push(`127.0.0.1:${port}`);
  return out;
}

export function mqttStatus(): MqttStatus {
  const state = runtime();
  const config = readMqttConfig();
  return {
    listening: Boolean(state.aedes && state.server),
    error: state.error,
    enabled: config.enabled,
    port: config.port,
    wsEnabled: config.wsEnabled,
    wsListening: Boolean(state.wsServer && state.wsServer.address()),
    wsPort: config.wsPort,
    wsError: state.wsError,
    publicWsUrl: config.wsEnabled ? publicWssUrl(config.wsPath) : null,
    wsPath: config.wsPath,
    startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    addresses: addresses(config.port),
    online: state.clients.size,
    totalMessages: state.totalMessages,
    retained: state.retained.size,
    denied: state.denied,
  };
}

export function mqttClients(): MqttRuntimeClient[] {
  return [...runtime().clients.values()].sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
}

/** 被拦截的请求（最近 20 条，供页面排查主题写错） */
export function mqttDenials(): MqttDenial[] {
  return [...runtime().denials];
}

/** 清空被拦截记录 */
export function clearMqttDenials(): void {
  runtime().denials.length = 0;
}

export function mqttRecent(): MqttRuntimeMessage[] {
  return [...runtime().recent];
}

export function clearMqttRecent(): void {
  runtime().recent.length = 0;
}

/** 站点（工作台）向设备下发消息：走 broker 内部发布，不经过 ACL */
export function publishFromSite(
  topic: string,
  payload: string,
  options: { qos?: 0 | 1; retain?: boolean; auto?: boolean } = {},
): { ok: boolean; error?: string } {
  const state = runtime();
  if (!state.aedes) return { ok: false, error: "broker 未运行" };
  const trimmed = topic.trim();
  if (!trimmed || /[#+]/.test(trimmed)) return { ok: false, error: "主题不能为空且不能含 + / #" };
  if (payload.length > 16 * 1024) return { ok: false, error: "载荷过大（上限 16KB）" };

  const qos = options.qos === 1 ? 1 : 0;
  const retain = Boolean(options.retain);
  state.aedes.publish(
    {
      cmd: "publish",
      topic: trimmed,
      payload: Buffer.from(payload),
      qos,
      retain,
      dup: false,
    },
    () => {},
  );

  state.totalMessages += 1;
  state.recent.unshift({
    at: new Date().toISOString(),
    topic: trimmed,
    qos,
    retain,
    payload: trimPayload(payload),
    clientId: "(站点)",
    fromSite: true,
  });
  if (state.recent.length > RECENT_LIMIT) state.recent.length = RECENT_LIMIT;
  recordCommand({
    topic: trimmed,
    payload: trimPayload(payload),
    qos,
    retain,
    device: deviceNameForTopic(trimmed),
    auto: Boolean(options.auto),
  });
  return { ok: true };
}

/** 命令记录（最新在前） */
export function mqttCommands(): MqttCommandLog[] {
  return [...runtime().commands];
}

/** 清空命令记录 */
export function clearMqttCommands(): void {
  runtime().commands.length = 0;
}

/** 通知设备去检查 OTA 升级（往它的 cmd 主题发一条约定消息） */
export function pushOtaCommand(username: string): { ok: boolean; error?: string; project?: string } {
  const account = readMqttConfig().accounts.find((item) => item.username === username);
  if (!account) return { ok: false, error: "账号不存在" };
  if (!account.otaProject) return { ok: false, error: "该账号未绑定 OTA 项目，先在「编辑」里选一个" };
  if (!listProjects().includes(account.otaProject)) return { ok: false, error: `OTA 项目「${account.otaProject}」不存在` };
  const result = publishFromSite(
    `${prefixOf(account)}cmd`,
    JSON.stringify({ cmd: "ota", project: account.otaProject }),
    { qos: 1 },
  );
  return result.ok ? { ok: true, project: account.otaProject } : { ok: false, error: result.error };
}

/** 断开所有在线设备 */
export function disconnectAll(): number {
  const state = runtime();
  const ids = [...state.refs.keys()];
  for (const id of ids) state.refs.get(id)?.close();
  return ids.length;
}

/** 设备总览：账号 + retained 状态 + 在线情况推导 */
export function mqttDevices(): MqttDeviceView[] {
  const state = runtime();
  const config = readMqttConfig();
  const onlineUsers = new Set([...state.clients.values()].map((client) => client.username));
  const historyTopics = new Set(mqttHistoryTopics().map((item) => item.topic));

  return config.accounts.map((account) => {
    const prefix = prefixOf(account);
    const statusTopic = `${prefix}status`;
    const statusEntry = state.retained.get(statusTopic) ?? null;

    let lastAt: string | null = statusEntry?.at ?? null;
    const metrics: string[] = [];
    for (const [topic, entry] of state.retained) {
      if (topic.startsWith(prefix) && topic !== statusTopic) {
        metrics.push(topic);
        if (!lastAt || entry.at > lastAt) lastAt = entry.at;
      }
    }
    for (const message of state.recent) {
      if (message.topic.startsWith(prefix)) {
        if (!lastAt || message.at > lastAt) lastAt = message.at;
        if (historyTopics.has(message.topic) && !metrics.includes(message.topic)) {
          metrics.push(message.topic);
        }
      }
    }

    const runtimeClient = [...state.clients.values()].find((client) => client.username === account.username) ?? null;

    return {
      username: account.username,
      prefix,
      otaProject: account.otaProject ?? "",
      online: account.enabled && onlineUsers.has(account.username),
      runtime: runtimeClient
        ? {
            id: runtimeClient.id,
            ip: runtimeClient.ip,
            connectedAt: runtimeClient.connectedAt,
            subscriptions: runtimeClient.subscriptions,
            lastPingAt: runtimeClient.lastPingAt,
            published: runtimeClient.published,
          }
        : null,
      status: statusEntry?.payload ?? null,
      statusAt: statusEntry?.at ?? null,
      lastAt,
      metrics: metrics
        .filter((topic) => historyTopics.has(topic))
        .sort((a, b) => a.localeCompare(b)),
      published: account.published,
    };
  });
}

export function mqttRetained(): RetainedEntry[] {
  return [...runtime().retained.values()].sort((a, b) => a.topic.localeCompare(b.topic));
}

/** 清除某个 retained 主题（发一条空载荷 retained） */
export function clearRetained(topic: string): boolean {
  const state = runtime();
  if (!state.aedes || !state.retained.has(topic)) return false;
  state.retained.delete(topic);
  persistRetained();
  state.aedes.publish(retainedPacket(topic, Buffer.alloc(0)), () => {});
  return true;
}

/** 断开某个在线客户端 */
export function disconnectClient(clientId: string): boolean {
  const client = runtime().refs.get(clientId);
  if (!client) return false;
  client.close();
  return true;
}
