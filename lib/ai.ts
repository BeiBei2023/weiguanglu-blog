import fs from "node:fs";
import path from "node:path";

/**
 * OpenCode Zen —— 工作台的 AI 能力（自用）
 *
 * 原则（用户明确要求）：
 * - key 由用户在页面上自己填，存 `data/ai.json`（不进 git、随 data/ 备份、只在服务器上）
 * - **只有手动点按钮才调用**：不做定时、不在打开页面时自动跑
 * - 默认用 Zen 的免费模型（走 chat/completions，成本 $0）
 * - 每次生成的解读存档到 `data/ai-reports/`（同名 `.json` + `.md`，可翻历史、可导出）
 *
 * ⚠️ 部分免费模型会声明「收集数据用于改进模型」→ 只发公开标题/链接这类内容，
 *    不要把个人或敏感信息喂进去。
 */

const CONFIG_FILE = path.join(process.cwd(), "data", "ai.json");
const REPORT_DIR = path.join(process.cwd(), "data", "ai-reports");
const KEEP_REPORTS = 100;
const TIMEOUT_MS = 90_000;

/** OpenCode Go（订阅制）的接口基址；Zen 余额是 https://opencode.ai/zen/v1 */
export const ZEN_GO_BASE = "https://opencode.ai/zen/go/v1";
export const ZEN_BASE = "https://opencode.ai/zen/v1";

/** Go 订阅里走 chat/completions（OpenAI 兼容）的模型（2026-10 查证；`/zen/go/v1/models` 可复核） */
export const GO_MODELS: { id: string; label: string }[] = [
  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash（默认）" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "mimo-v2.6-flash", label: "小米 MiMo V2.6 Flash" },
  { id: "mimo-v2.6-pro", label: "小米 MiMo V2.6 Pro" },
  { id: "mimo-v2.5", label: "小米 MiMo V2.5" },
  { id: "mimo-v2.5-pro", label: "小米 MiMo V2.5 Pro" },
  { id: "glm-5.3-flash", label: "GLM-5.3-Flash" },
  { id: "glm-5.3", label: "GLM-5.3" },
  { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "kimi-k3", label: "Kimi K3" },
  { id: "longcat-2.0", label: "LongCat-2.0" },
  { id: "longcat-2.5-preview-free", label: "LongCat 2.5 Preview（免费 · 不限量）" },
  { id: "space-bunny-free", label: "Space Bunny（免费 · 不限量）" },
  { id: "hy4-preview", label: "Hy4 preview" },
  { id: "hy3", label: "Hy3" },
];

export const DEFAULT_MODEL = "deepseek-v4.1-flash";

export interface AiConfig {
  apiKey: string;
  /** 接口基址：Go 订阅用 https://opencode.ai/zen/go/v1，Zen 余额用 https://opencode.ai/zen/v1 */
  endpoint: string;
  model: string;
  /** 每次解读挑多少条重点（3–20） */
  points: number;
}

const DEFAULT_CONFIG: AiConfig = {
  apiKey: "",
  endpoint: ZEN_GO_BASE,
  model: DEFAULT_MODEL,
  points: 10,
};

function clampPoints(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_CONFIG.points;
  return Math.min(20, Math.max(3, Math.round(number)));
}

function normalizeEndpoint(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CONFIG.endpoint;
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : DEFAULT_CONFIG.endpoint;
}

export function readAiConfig(): AiConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<AiConfig>;
    return {
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
      endpoint: normalizeEndpoint(raw.endpoint),
      model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : DEFAULT_MODEL,
      points: clampPoints(raw.points),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveAiConfig(patch: Partial<AiConfig>): AiConfig {
  const current = readAiConfig();
  const next: AiConfig = {
    apiKey:
      typeof patch.apiKey === "string" ? patch.apiKey.trim() : current.apiKey,
    endpoint:
      patch.endpoint === undefined ? current.endpoint : normalizeEndpoint(patch.endpoint),
    model:
      typeof patch.model === "string" && patch.model.trim() ? patch.model.trim() : current.model,
    points: patch.points === undefined ? current.points : clampPoints(patch.points),
  };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, CONFIG_FILE);
  return next;
}

/** 给页面的配置视图（**不含 key**，只说明有没有填） */
export function publicAiConfig(): {
  configured: boolean;
  endpoint: string;
  model: string;
  points: number;
  models: { id: string; label: string }[];
} {
  const config = readAiConfig();
  return {
    configured: Boolean(config.apiKey),
    endpoint: config.endpoint,
    model: config.model,
    points: config.points,
    models: GO_MODELS,
  };
}

export class AiError extends Error {}

function describeStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "API key 不对、或接口地址不匹配：Go 订阅要用 https://opencode.ai/zen/go/v1，Zen 余额用 https://opencode.ai/zen/v1（key 在 opencode.ai/auth 复制）";
  }
  if (status === 429) return "被限速了，等一会儿再试（免费模型也有频率限制）";
  if (status === 404) return "接口地址或模型不对：换个模型试试，或检查上面的接口地址";
  const snippet = body.slice(0, 200).replace(/\s+/g, " ").trim();
  return `调用失败（HTTP ${status}）${snippet ? `：${snippet}` : ""}`;
}

/** 通用调用：任意 messages 进、文本出（其它页要接 AI 就复用这个） */
export async function runZenChat(
  messages: { role: "system" | "user"; content: string }[],
  options: { model?: string } = {},
): Promise<{ text: string; model: string }> {
  const config = readAiConfig();
  if (!config.apiKey) throw new AiError("还没填 API key —— 先在上面的「AI 设置」里填一下");
  const model = options.model?.trim() || config.model;

  let response: Response;
  try {
    response = await fetch(`${config.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        // Go 要求客户端带上自己的 UA 与稳定的会话 id（便于路由与提示缓存）
        "user-agent": "my-blog-workstation/1.0",
        "x-opencode-session": "my-blog-workstation",
      },
      body: JSON.stringify({ model, messages }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new AiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "等模型回复超时了（90 秒），稍后再试"
        : "连不上 OpenCode 接口，检查服务器网络后重试",
    );
  }

  const body = await response.text();
  if (!response.ok) throw new AiError(describeStatus(response.status, body));

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new AiError("Zen 返回的不是合法 JSON，稍后再试");
  }
  const text = parsed.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("模型没有返回内容，换个模型再试");
  return { text, model };
}

export interface AiReportPoint {
  title: string;
  url: string;
  source: string;
  /** 2–3 句详细解说：是什么 + 为什么值得看 */
  detail: string;
}

export interface AiReport {
  id: string;
  at: string;
  task: string;
  model: string;
  headline: string;
  overview: string;
  points: AiReportPoint[];
}

export interface AiReportSummary {
  id: string;
  at: string;
  model: string;
  headline: string;
  count: number;
}

function reportId(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const REPORT_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{6}$/;

export function reportMarkdown(report: AiReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.headline}`, "");
  lines.push(
    `> 生成时间：${report.at} · 模型：${report.model} · 任务：${report.task}`,
    "",
  );
  if (report.overview) {
    lines.push("## 总览", "", report.overview, "");
  }
  report.points.forEach((point, index) => {
    lines.push(`## ${index + 1}. ${point.title}`, "");
    lines.push(`- 来源：${point.source || "—"}`);
    if (point.url) lines.push(`- 链接：${point.url}`);
    lines.push("", point.detail, "");
  });
  lines.push("---", "", "*由工作台 AI 解读生成（OpenCode Zen 免费模型）。*", "");
  return lines.join("\n");
}

export function writeAiReport(input: Omit<AiReport, "id" | "at">): AiReport {
  const now = new Date();
  const report: AiReport = {
    ...input,
    id: reportId(now),
    at: now.toLocaleString("zh-CN", { hour12: false }),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const base = path.join(REPORT_DIR, report.id);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(`${base}.md`, reportMarkdown(report), "utf8");
  pruneReports();
  return report;
}

function pruneReports(): void {
  try {
    const files = fs
      .readdirSync(REPORT_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse();
    for (const name of files.slice(KEEP_REPORTS)) {
      const base = path.join(REPORT_DIR, name.replace(/\.json$/, ""));
      fs.rmSync(`${base}.json`, { force: true });
      fs.rmSync(`${base}.md`, { force: true });
    }
  } catch {
    // 清理失败不影响本次生成
  }
}

export function listAiReports(): AiReportSummary[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(REPORT_DIR).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const summaries: AiReportSummary[] = [];
  for (const name of names.sort().reverse()) {
    const report = readAiReport(name.replace(/\.json$/, ""));
    if (!report) continue;
    summaries.push({
      id: report.id,
      at: report.at,
      model: report.model,
      headline: report.headline,
      count: report.points.length,
    });
  }
  return summaries;
}

export function readAiReport(id: string): AiReport | null {
  if (!REPORT_ID_RE.test(id)) return null;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(REPORT_DIR, `${id}.json`), "utf8"),
    ) as Partial<AiReport>;
    if (!Array.isArray(raw.points)) return null;
    return {
      id,
      at: typeof raw.at === "string" ? raw.at : id,
      task: typeof raw.task === "string" ? raw.task : "",
      model: typeof raw.model === "string" ? raw.model : "",
      headline: typeof raw.headline === "string" ? raw.headline : "AI 解读",
      overview: typeof raw.overview === "string" ? raw.overview : "",
      points: raw.points as AiReportPoint[],
    };
  } catch {
    return null;
  }
}

export function readAiReportMarkdown(id: string): string | null {
  if (!REPORT_ID_RE.test(id)) return null;
  try {
    return fs.readFileSync(path.join(REPORT_DIR, `${id}.md`), "utf8");
  } catch {
    return null;
  }
}

/**
 * 从模型输出里抠出 JSON 对象（免费模型不一定支持 response_format，
 * 常见形态是「废话 + ```json 代码块」），所以这里做宽松解析。
 */
export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
