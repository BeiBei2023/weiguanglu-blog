/**
 * 「设备连接说明」文档生成器。
 *
 * 纯函数、无 Node 依赖（server / client 都能 import）：
 * 面板里「新建账号 / 重置密码 / 账号行」三处都可以直接下载这份 Markdown。
 *
 * 注意：导出的连接说明与站点设置里的主题约定必须一致，改一处要两处一起改。
 */

export interface ConnectDocInput {
  /** 账号用户名 */
  username: string;
  /** 一次性密码（仅创建/重置时拿得到；不传则写成「见创建时保存的那份」） */
  password?: string;
  /** 主题前缀（含结尾斜杠），如 wgl/esp32-keting/ */
  prefix: string;
  /** 备注 */
  note?: string;
  /** 绑定的 OTA 项目（空 = 未绑定） */
  otaProject?: string;
  /** 是否放开任意主题（仅测试账号） */
  allowAnyTopic?: boolean;
  /** 账号是否启用 */
  enabled?: boolean;
  /** 站点地址，如 https://www.example.com（用于 OTA 固件地址与 MQTTX Host 推导） */
  siteUrl: string;
  /** 公网 wss 地址，如 wss://www.example.com/mqtt-ws */
  publicWsUrl?: string | null;
  /** 内网 TCP 地址，如 10.0.0.2:18830 */
  tcpAddress: string;
  /** WebSocket 端口（内网），如 18831 */
  wsPort: number;
  /** 公网 wss 路径，如 /mqtt-ws */
  wsPath: string;
  /** 文档生成原因，决定标题下的一句话 */
  issue?: "created" | "reset" | "later";
  /** 生成时间（默认 now） */
  at?: Date;
}

/** Markdown 代码围栏（避免在模板里写反引号） */
const F = "```";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function stamp(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function trimSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

export function connectDocFilename(username: string, at: Date = new Date()): string {
  return `博客-MQTT-${username}-连接说明-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}.md`;
}

export function buildConnectDoc(input: ConnectDocInput): string {
  const at = input.at ?? new Date();
  const site = trimSuffix(input.siteUrl, "/");
  const prefix = input.prefix.endsWith("/") ? input.prefix : `${input.prefix}/`;
  const root = trimSuffix(prefix, "/");
  const prefixPlain = trimSuffix(root, "#");
  const tcpHost = input.tcpAddress;
  const tcpMatch = /^(.+):(\d+)$/.exec(tcpHost);
  const tcpHostOnly = tcpMatch ? tcpMatch[1] : tcpHost;
  const tcpPort = tcpMatch ? Number(tcpMatch[2]) : 18830;
  const wsHost = tcpHostOnly;
  const internalWs = `ws://${wsHost}:${input.wsPort}${input.wsPath}`;
  const publicWs = input.publicWsUrl || "";
  const publicParts = (() => {
    if (!publicWs) return null;
    try {
      const url = new URL(publicWs);
      return { host: url.hostname, port: url.port || "443", path: url.pathname || input.wsPath };
    } catch {
      return null;
    }
  })();
  const publicSecure = publicWs.startsWith("wss://");
  const otaProject = input.otaProject?.trim() ?? "";
  const issueLine =
    input.issue === "reset"
      ? "本次密码已重置：旧密码立即失效，设备需改用下方新密码重连。"
      : input.issue === "later"
        ? "文档由工作台导出；密码不会在面板保存明文，忘记时请点「重置密码」生成新密码。"
        : "密码为一次性生成，面板不会保存明文；请妥善保存本文件。";
  /** 代码示例里用的密码：有明文就直接填进去（省得手抄），没有则留占位符 */
  const pwd = input.password ?? "<本文件第一节的密码>";
  const lines: string[] = [];
  const push = (...items: string[]) => lines.push(...items);

  push(
    "# 博客 · MQTT 设备连接说明",
    "",
    `- 设备账号：\`${input.username}\``,
    `- 生成时间：${stamp(at)}`,
    `- 站点：${site}`,
    `- MQTT 版本要求：**3.1.1**（broker 不支持 5.0）`,
    "",
    "> 把这份文件跟着设备固件放一起：里面是连接参数、主题约定、示例代码和排查表。",
    "",
    "---",
    "",
    "## 一、账号信息",
    "",
    "| 项 | 值 |",
    "|---|---|",
    `| 用户名 | \`${input.username}\` |`,
  );

  if (input.password) {
    push(`| 密码 | \`${input.password}\` |`);
  } else {
    push(`| 密码 | （不在此处显示；忘记请到面板「重置密码」） |`);
  }

  push(
    `| 允许读写的主题前缀 | \`${prefix}\`${input.allowAnyTopic ? "（已放开任意主题，仅测试账号建议开启）" : ""} |`,
    `| 账号状态 | ${input.enabled === false ? "**已停用**（需在面板启用后才能连接）" : "启用中"} |`,
    `| 备注 | ${input.note?.trim() ? input.note.trim() : "—"} |`,
    `| 绑定 OTA 项目 | ${otaProject ? `\`${otaProject}\`` : "未绑定（不影响遥测/命令，只影响自动查询固件信息）"} |`,
    `| 遗嘱（LWT）主题 | \`${prefixPlain}/status\`（载荷 \`offline\`、QoS 1、retain = 是） |`,
    "",
    `> ${issueLine}`,
    "",
    "---",
    "",
    "## 二、连接参数（三选一）",
    "",
    publicSecure
      ? "### A. 公网 wss（设备在任意网络时用这个，推荐）"
      : "### A. WebSocket（当前站点未启用 TLS：`ws://`，只建议内网或调试用）",
    "",
    "| 参数 | 值 |",
    "|---|---|",
    `| 协议 | MQTT over WebSocket（${publicSecure ? "TLS，即 `wss://`" : "未加密，即 `ws://`"}） |`,
    `| 地址 | \`${publicWs || "（未配置公网 wss，见下面的内网方式）"}\` |`,
  );

  if (publicParts) {
    push(
      `| Host / Port / Path | \`${publicParts.host}\` / \`${publicParts.port}\` / \`${publicParts.path}\` |`,
      publicSecure
        ? "| SSL/TLS | 打开（校验域名证书） |"
        : "| SSL/TLS | 关闭（该地址未加密，仅内网/测试） |",
    );
  }

  push(
    "| MQTT 版本 | **3.1.1** |",
    `| 用户名 / 密码 | \`${input.username}\` / 见上方账号信息 |`,
    "| Keep Alive | 60 秒（网络不稳可 30） |",
    "| Clean Session | 是 |",
    "",
    "### B. 内网 TCP（设备与服务器同在 EasyTier 内网时）",
    "",
    "| 参数 | 值 |",
    "|---|---|",
    `| 地址 | \`mqtt://${tcpHost}\` |`,
    "| 传输 | 原生 TCP（**无 TLS**，只走内网） |",
    "| 其它 | 同上（3.1.1 / KeepAlive 60 / Clean Session） |",
    "",
    "### C. 内网 WebSocket（内网设备想复用 wss 代码路径时）",
    "",
    `- 地址：\`${internalWs}\``,
    "- 子协议：`mqtt`（部分库写 `mqttv3.1` 也可以）",
    "- 其它同 A 段",
    "",
    "---",
    "",
    "## 三、客户端字段速查",
    "",
    "### MQTTX（桌面客户端，手动调试用）",
    "",
    "| 字段 | 填什么 |",
    "|---|---|",
    `| 协议 | ${publicParts ? (publicSecure ? "`wss://`" : "`ws://`（未加密）") : "`ws://`（内网）"} |`,
    `| Host | ${publicParts ? `\`${publicParts.host}\`` : `\`${wsHost}\``} |`,
    `| Port | ${publicParts ? `\`${publicParts.port}\`` : `\`${input.wsPort}\``} |`,
    `| Path | \`${publicParts ? publicParts.path : input.wsPath}\` |`,
    "| MQTT Version | **3.1.1**（GUI 默认即是；CLI 要显式 `-V 3.1.1`） |",
    `| Username / Password | \`${input.username}\` / 见上方 |`,
    "| SSL/TLS | " +
      (publicParts
        ? publicSecure
          ? "打开"
          : "关闭（该地址未加密）"
        : "关闭（内网 ws 无 TLS）") +
      " |",
    "| Keep Alive | 60 |",
    "| 订阅主题 | `" + `${prefix}#` + "` |",
    "",
    "### 命令行（mosquitto 客户端，Linux/PC 上快速验证）",
    "",
    F + "bash",
    "# 订阅（收命令）：只在你自己前缀内",
    `mosquitto_sub -h <host> -p <port> -V mqttv311 -u ${input.username} -P '${pwd}' \\`,
    `  -t '${prefix}#' -v`,
    "",
    "# 发布一条状态（带 retain）",
    `mosquitto_pub -h <host> -p <port> -V mqttv311 -u ${input.username} -P '${pwd}' \\`,
    `  -t '${prefixPlain}/status' -r -q 1 -m '{"fw":"1.0.0","rssi":-57}'`,
    F,
    "",
    "> 走公网 wss 时命令行不方便，建议用 MQTTX；`-V mqttv311` 就是 MQTT 3.1.1。",
    "",
    "---",
    "",
    "## 四、主题约定（重要）",
    "",
    "**你只能读写 `" + prefix + "` 下面的主题：**",
    "",
    "- 发布/订阅前缀之外的主题 → 会被 broker 拦下；越权**发布**还会导致该设备被断开（fail-closed，客户端自动重连即可）",
    "- 越权**订阅** → 订阅失败（SUBACK 失败码），不会断开",
    "- 面板「最近被拦截的请求」会记录越权的时间/主题/来源，方便查固件写错的主题",
    "",
    "| 方向 | 主题 | QoS | retain | 说明 |",
    "|---|---|---|---|---|",
    `| 设备 → 站点 | \`${prefixPlain}/status\` | 1 | 是 | 在线状态与信息（配 LWT 使用）；JSON 里的 \`fw\` / \`ip\` / \`rssi\` / \`uptime\` 会显示在设备卡片上 |`,
    `| 设备 → 站点 | \`${prefixPlain}/telemetry/<名称>\` | 0 | 否 | 周期遥测；**数字会被自动记成曲线**（如 \`{"v":25.6}\`） |`,
    `| 设备 → 站点 | \`${prefixPlain}/event\` | 1 | 否 | 事件 / 告警 |`,
    `| 设备 → 站点 | \`${prefixPlain}/cmd/ack\` | 1 | 否 | 命令回执（务必回，页面靠它标记「已回执」） |`,
    `| 设备 → 站点 | \`${prefixPlain}/ota\` | 0 | 否 | 询问最新固件信息（见第七节） |`,
    `| 站点 → 设备 | \`${prefixPlain}/cmd\` | 1 | 否 | 下行命令（面板「下发」） |`,
    `| 站点 → 设备 | \`${prefixPlain}/ota/reply\` | 1 | 否 | 站点自动回复的固件信息 |`,
    "",
    "载荷建议统一成 `{\"v\":1,\"ts\":<毫秒时间戳>,\"data\":{...}}`，带版本号方便以后加字段。",
    "",
    "**遗嘱（Last Will）务必配上**：设备异常掉线时，broker 会替你发一条 `offline`，页面立刻知道设备离线。",
    "",
    "---",
    "",
    "## 五、五分钟跑通（MQTTX）",
    "",
    `1. 新建连接：按上面「三、客户端字段速查」填 ${publicParts ? "wss" : "内网 ws/TCP"} 参数，用户名 \`${input.username}\`，密码见第一节`,
    `2. 订阅 \`${prefix}#\``,
    `3. 发布 \`${prefixPlain}/status\`，载荷 \`{"fw":"1.0.0","rssi":-57}\`，QoS 1、retain 勾上`,
    "4. 打开网站 `/w/mqtt`：设备卡片应显示固件/信号强度、「Retained」里能看到这条消息",
    `5. 在面板上点该设备的「下发」（主题 \`${prefixPlain}/cmd\`），设备端往 \`${prefixPlain}/cmd/ack\` 回一条即可看到「已回执」`,
    "",
    "若第 3 步发不出去：检查主题是否在 `" + prefix + "` 内（面板「最近被拦截的请求」会直接告诉你原因）。",
    "",
    "---",
    "",
    "## 六、设备端示例代码",
    "",
    "### 1) ESP-IDF（esp-mqtt，走公网 wss）",
    "",
    F + "c",
    `// menuconfig：Component config → ESP-MQTT → Enable MQTT over WebSocket`,
    `//           Component config → mbedTLS → Certificate Bundle（用下面的 crt_bundle_attach）`,
    `#include "esp_crt_bundle.h"`,
    `#include "mqtt_client.h"`,
    "",
    "static void mqtt_event_handler(void *args, esp_event_base_t base, int32_t id, void *data) {",
    "    esp_mqtt_event_handle_t e = data;",
    "    switch ((esp_mqtt_event_id_t)id) {",
    "    case MQTT_EVENT_CONNECTED:",
    `        esp_mqtt_client_subscribe(e->client, "${prefix}#", 1);`,
    `        esp_mqtt_client_subscribe(e->client, "${prefixPlain}/cmd", 1);`,
    `        esp_mqtt_client_publish(e->client, "${prefixPlain}/status", "{\\"fw\\":\\"1.0.0\\"}", 0, 1, 1);`,
    "        break;",
    "    case MQTT_EVENT_DATA:",
    `        // e->topic / e->data 即下行命令；处理完记得回执：`,
    `        // esp_mqtt_client_publish(e->client, "${prefixPlain}/cmd/ack", "{\\"ok\\":true}", 0, 1, 0);`,
    "        break;",
    "    default: break;",
    "    }",
    "}",
    "",
    "void mqtt_start(void) {",
    "    const esp_mqtt_client_config_t cfg = {",
    publicParts
      ? `        .broker.address.uri = "${publicWs}",`
      : `        .broker.address.uri = "ws://${wsHost}:${input.wsPort}${input.wsPath}",`,
    publicParts ? "        .broker.verification.crt_bundle_attach = esp_crt_bundle_attach," : "        // 内网 ws：不需要证书校验",
    `        .credentials.username = "${input.username}",`,
    `        .credentials.authentication.password = ${JSON.stringify(pwd)},`,
    "        .session.keepalive = 60,",
    "        .session.disable_clean_session = false,",
    "        .session.last_will = {",
    `            .topic = "${prefixPlain}/status",`,
    "            .msg = \"offline\",",
    "            .qos = 1,",
    "            .retain = true,",
    "        },",
    "    };",
    "    esp_mqtt_client_handle_t client = esp_mqtt_client_init(&cfg);",
    "    esp_mqtt_client_register_event(client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);",
    "    esp_mqtt_client_start(client);",
    "}",
    F,
    "",
    "> 走内网 TCP 时把 `.broker.address.uri` 换成 `" + `mqtt://${tcpHost}` + "`，并去掉 `crt_bundle_attach` 那行即可，其余不变。",
    "",
    "### 2) Python（paho-mqtt，PC / 树莓派上验证）",
    "",
    F + "python",
    "import paho.mqtt.client as mqtt",
    "",
    `client = mqtt.Client(client_id="${input.username}-pc", protocol=mqtt.MQTTv311)`,
    `client.username_pw_set("${input.username}", "${pwd}")`,
    `client.will_set("${prefixPlain}/status", "offline", qos=1, retain=True)`,
    "",
    "def on_connect(c, userdata, flags, rc):",
    "    print('connected', rc)",
    `    c.subscribe("${prefix}#")`,
    `    c.publish("${prefixPlain}/status", '{"fw":"pc-test"}', qos=1, retain=True)`,
    "",
    "def on_message(c, userdata, msg):",
    "    print(msg.topic, msg.payload.decode())",
    `    if msg.topic.endswith("/cmd"):`,
    `        c.publish(msg.topic + "/ack", '{"ok":true}', qos=1)`,
    "",
    "client.on_connect = on_connect",
    "client.on_message = on_message",
    `client.connect(${JSON.stringify(tcpHostOnly)}, ${tcpPort}, 60)   # 内网 TCP 直连；走公网时建议用 MQTTX，或改用 websockets 传输`,
    "client.loop_forever()",
    F,
    "",
    "### 3) Node / mqtt.js（走 wss 时可直接用）",
    "",
    F + "js",
    'import mqtt from "mqtt";',
    "",
    `const client = mqtt.connect(${JSON.stringify(publicWs || internalWs)}, {`,
    "  protocolVersion: 4,        // MQTT 3.1.1",
    `  username: ${JSON.stringify(input.username)},`,
    `  password: ${JSON.stringify(pwd)},`,
    "  keepalive: 60,",
    `  will: { topic: ${JSON.stringify(`${prefixPlain}/status`)}, payload: "offline", qos: 1, retain: true },`,
    "});",
    "",
    'client.on("connect", () => {',
    `  client.subscribe(${JSON.stringify(`${prefix}#`)});`,
    `  client.publish(${JSON.stringify(`${prefixPlain}/status`)}, '{"fw":"node-test"}', { qos: 1, retain: true });`,
    "});",
    "",
    'client.on("message", (topic, payload) => {',
    "  console.log(topic, payload.toString());",
    `  if (topic.endsWith("/cmd")) client.publish(topic + "/ack", '{"ok":true}', { qos: 1 });`,
    "});",
    F,
    "",
    "---",
    "",
    "## 七、命令、回执与 OTA",
    "",
    "### 命令与回执",
    "",
    `- 站点 → 设备：面板「下发」发到 \`${prefixPlain}/cmd\`；载荷自定义（建议 JSON）`,
    `- 设备回执：处理完往 **命令主题 + \`/ack\`** 发一条（如 \`${prefixPlain}/cmd/ack\`），页面会把它标成「已回执」`,
    "- 参数限制：QoS 0/1、retain 可选、载荷 ≤ 16KB、主题里不能用 `+` / `#`",
    "",
    "### OTA",
    "",
  );

  if (otaProject) {
    push(
      `- 本账号绑定项目：\`${otaProject}\``,
      `- 设备往 \`${prefixPlain}/ota\` 发任意载荷（如 \`{"cmd":"check"}\`），站点自动回复到 \`${prefixPlain}/ota/reply\`：`,
      "",
      F + "json",
      "{",
      '  "available": true,',
      `  "project": "${otaProject}",`,
      '  "version": "20260928_075056",',
      '  "md5": "",',
      '  "size": 6144,',
      '  "sizeStr": "6.0 KB",',
      `  "url": "${site}/api/ota/${otaProject}/firmware.bin",`,
      `  "path": "/api/ota/${otaProject}/firmware.bin",`,
      '  "authRequired": true',
      "}",
      F,
      "",
      "- 也可以不走 MQTT：直接定时 `GET " + `${site}/api/ota/${otaProject}/info` + "` 看 `version` 是否需要升级",
      "- `authRequired: true` 表示固件接口需要设备令牌：请求头 `Authorization: Bearer <OTA_TOKEN>`（或 `?token=<值>`；令牌在服务器 `.env` 里，属站点机密，不要写死在公开仓库）",
      "- 下载固件：`GET " + `${site}/api/ota/${otaProject}/firmware.bin` + "`（带令牌）；旧版兼容地址：`/project/<项目>/firmware.bin`、`/firmware.bin`",
    );
  } else {
    push(
      "- 本账号**未绑定 OTA 项目**：遥测、命令、回执均可正常用，只是不能自动查询固件信息",
      "- 需要 OTA 时，在面板「设备账号 → 编辑」里绑定一个项目即可（项目在 `/w/ota` 里上传固件）",
    );
  }

  push(
    "",
    "---",
    "",
    "## 八、排查表",
    "",
    "| 现象 | 原因 / 处理 |",
    "|---|---|",
    "| 连接被拒（Not authorized） | 用户名或密码错；账号被停用；刚重置过密码需用新密码 |",
    "| 发不出去、设备反复重连 | 主题写到了自己前缀之外（越权发布会被断开）；面板「最近被拦截的请求」有记录 |",
    "| 订阅后收不到消息 | 订阅了别人前缀的主题（SUBACK 失败）；确认订阅写的是 `" + prefix + "#` |",
    "| 页面看不到消息 | 面板「消息记录」看是否收到；确认 broker 状态「运行中」 |",
    "| 曲线不显示 | `telemetry/<名称>` 的载荷里要能解析出数字（`{\"v\":25.6}` 最稳） |",
    "| 设备问固件没回复 | 账号没绑 OTA 项目；或把问题发到了 `" + prefix + "` 之外 |",
    "| 固件下载 401 | 需要设备令牌：`Authorization: Bearer <OTA_TOKEN>` |",
    "| 公网 wss 连不上 | 检查 Path 是否为 `" + (publicParts ? publicParts.path : input.wsPath) + "`、MQTT 版本是否 3.1.1、SSL 是否打开 |",
    "",
    "---",
    "",
    "## 九、安全须知",
    "",
    "- **一台设备一个账号**，不要多台共用；泄露了就在面板「重置密码」，旧密码立即失效",
    "- 密码只在创建/重置时显示一次（本文件是你唯一的机会，收好）",
    "- 账号只能读写自己前缀内的主题；`allowAnyTopic` 仅供测试，正式设备不要开",
    "- 走公网时请用 `wss://`（加密）；内网 `mqtt://` 是明文，不要拿它穿公网",
    "",
    `> 站点手册（更全的版本）：工作台 \`/w/mqtt\` 页面「连接参数」折叠区；仓库文档 \`文档/MQTT.md\`。`,
    "",
  );

  return `${lines.filter((line) => line !== undefined).join("\n")}\n`;
}
