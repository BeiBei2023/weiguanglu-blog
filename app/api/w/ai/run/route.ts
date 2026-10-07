import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  AiError,
  parseJsonLoose,
  readAiConfig,
  runZenChat,
  writeAiReport,
  type AiReport,
  type AiReportPoint,
} from "@/lib/ai";
import { readHot } from "@/lib/hot";

export const dynamic = "force-dynamic";

/**
 * 手动触发的 AI 解读（只有点按钮才会调到这里，页面加载/定时都不会调用）。
 *
 * task：
 * - `hot`：挑重点（旧版，保留兼容）
 * - `hot-batch`：**逐条解说一批热点**（前端把全部条目分成几批，逐批调用）
 * - `hot-save`：把各批结果合成一份存档报告（不调用模型，只汇总写盘）
 *
 * 以后其它页面要接 AI，可以继续在这里加 task 分支（`lib/ai.ts` 的 runZenChat 是通用的）。
 */

interface RawPoint {
  title?: unknown;
  url?: unknown;
  source?: unknown;
  detail?: unknown;
}

function buildHotPrompt(points: number): { system: string; user: string } {
  return {
    system: [
      "你是「博客」工作台的资讯解读助手，读者是一位中文读者（嵌入式 / 电子 / DIY 爱好者，喜欢自己动手做工具）。",
      "你会收到一组当日热点条目的标题与链接（可能含英文）。请挑出最值得读的那些，写成中文详细解说。",
      "硬性要求：",
      "1) 每条 2–3 句，讲清「这是什么」和「为什么值得看」，**不要复读标题**，必要的信息（数字、型号、结论）要保留；",
      "2) 同一件事在不同来源重复出现时合并成一条，选信息最全的那个链接；",
      "3) 中文标题可意译，不要机器直译腔；",
      "4) 只输出 JSON，不要任何多余文字、不要 Markdown 代码块以外的说明。",
    ].join("\n"),
    user: [
      `请给出最多 ${points} 条重点，并严格按下面的 JSON 结构输出：`,
      `{"headline":"今日重点解读（10 字以内的标题）","overview":"3–4 句总览：今天整体最值得注意的方向","points":[{"title":"中文标题","url":"原文链接","source":"来源名","detail":"2–3 句详细解说"}]}`,
      "",
      "条目如下：",
    ].join("\n"),
  };
}

function normalizePoints(
  value: unknown,
  fallbackUrl: Map<string, string>,
  limit: number,
): AiReportPoint[] {
  if (!Array.isArray(value)) return [];
  const points: AiReportPoint[] = [];
  for (const raw of value as RawPoint[]) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const detail = typeof raw.detail === "string" ? raw.detail.trim() : "";
    if (!title || !detail) continue;
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    points.push({
      title,
      detail,
      source: typeof raw.source === "string" ? raw.source.trim() : "",
      // 模型偶尔会编链接：只接受与输入列表里出现过的链接，否则回退到标题匹配
      url: fallbackUrl.has(url) ? url : (fallbackUrl.get(title) ?? ""),
    });
    if (points.length >= limit) break;
  }
  return points;
}

/** 逐条解说的提示词：不挑不合并、不遗漏 */
function buildBatchPrompt(label: string, count: number): { system: string; user: string } {
  return {
    system: [
      "你是「博客」工作台的资讯解读助手，读者是一位中文读者（嵌入式 / 电子 / DIY 爱好者，喜欢自己动手做工具）。",
      "你会收到**一批**热点条目的标题、来源与链接（可能含英文）。",
      "硬性要求：",
      "1) **逐条**给出解说 —— 收到几条就写几条，不要挑选、不要合并、不要遗漏；",
      "2) 每条 2–3 句中文，讲清「这条在讲什么」和「为什么值得看 / 对读者有什么用」；**不要复读标题**，标题里已有的数字、型号、结论要保留；",
      "3) 中文标题可意译，不要机器直译腔；信息不足时如实说「标题信息有限」，**不要编造**；",
      "4) 只输出 JSON，不要任何多余文字。",
    ].join("\n"),
    user: [
      `下面这批共 ${count} 条（来自「${label}」）。请逐条解说，并严格按下面的 JSON 结构输出：`,
      `{"points":[{"title":"中文标题","url":"原文链接","source":"来源名","detail":"2–3 句详细解说"}]}`,
      "",
      "条目如下：",
    ].join("\n"),
  };
}

export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: {
    task?: string;
    points?: number;
    label?: string;
    model?: string;
    items?: { title?: unknown; url?: unknown; source?: unknown; meta?: unknown }[];
    sections?: { label?: unknown; points?: unknown }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const task = body.task ?? "hot";

  // ── 旧版：挑重点 ──────────────────────────────────────────────
  if (task === "hot") {
    const hot = readHot();
    // AI 只解读「GitHub 新星」（2026-10-07 决定）：其余三路只展示，不喂给模型
    const aiSources = (hot?.sources ?? []).filter((source) => source.id === "github");
    if (!hot || aiSources.every((source) => source.items.length === 0)) {
      return NextResponse.json(
        { error: "现在还没有「GitHub 新星」的数据，先去 /w/hot 点一下「立即刷新」" },
        { status: 400 },
      );
    }

    const config = readAiConfig();
    const limit = Math.min(20, Math.max(3, body.points ?? config.points));

    const lines: string[] = [];
    const fallbackUrl = new Map<string, string>();
    for (const source of aiSources) {
      lines.push(`【${source.name}】`);
      source.items.slice(0, 20).forEach((item) => {
        lines.push(`- ${item.title}${item.meta ? `（${item.meta}）` : ""} ${item.url}`);
        fallbackUrl.set(item.url, item.url);
        fallbackUrl.set(item.title.trim(), item.url);
      });
      lines.push("");
    }

    const prompt = buildHotPrompt(limit);
    try {
      const { text, model } = await runZenChat([
        { role: "system", content: prompt.system },
        { role: "user", content: `${prompt.user}\n${lines.join("\n")}` },
      ]);
      const parsed = parseJsonLoose(text) as
        | { headline?: unknown; overview?: unknown; points?: unknown }
        | null;
      if (!parsed) {
        return NextResponse.json(
          { error: "模型返回的内容没法解析成 JSON，换个模型再试一次" },
          { status: 502 },
        );
      }
      const points = normalizePoints(parsed.points, fallbackUrl, limit);
      if (!points.length) {
        return NextResponse.json(
          { error: "模型没给出有效的重点条目，换个模型再试一次" },
          { status: 502 },
        );
      }
      const report: AiReport = writeAiReport({
        task: "热点解读",
        model,
        headline:
          typeof parsed.headline === "string" && parsed.headline.trim()
            ? parsed.headline.trim().slice(0, 40)
            : "今日重点解读",
        overview: typeof parsed.overview === "string" ? parsed.overview.trim() : "",
        points,
      });
      return NextResponse.json({ ok: true, report });
    } catch (error) {
      if (error instanceof AiError) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      return NextResponse.json({ error: "生成失败，稍后再试" }, { status: 502 });
    }
  }

  // ── 新版：逐条解说一批 ────────────────────────────────────────
  if (task === "hot-batch") {
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((item) => ({
        title: typeof item?.title === "string" ? item.title.trim() : "",
        url: typeof item?.url === "string" ? item.url.trim() : "",
        source: typeof item?.source === "string" ? item.source.trim() : "",
        meta: typeof item?.meta === "string" ? item.meta.trim() : "",
      }))
      .filter((item) => item.title);
    if (items.length === 0) {
      return NextResponse.json({ error: "这一批没有条目" }, { status: 400 });
    }

    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "热点";
    const prompt = buildBatchPrompt(label, items.length);
    const lines = items.map(
      (item, index) =>
        `${index + 1}. ${item.title}${item.meta ? `（${item.meta}）` : ""}${item.source ? ` [${item.source}]` : ""} ${item.url}`,
    );
    const fallbackUrl = new Map<string, string>();
    for (const item of items) {
      fallbackUrl.set(item.url, item.url);
      fallbackUrl.set(item.title, item.url);
    }

    try {
      const { text, model } = await runZenChat([
        { role: "system", content: prompt.system },
        { role: "user", content: `${prompt.user}\n${lines.join("\n")}` },
      ]);
      const parsed = parseJsonLoose(text) as { points?: unknown } | null;
      const points = normalizePoints(parsed?.points, fallbackUrl, items.length + 5);
      if (!points.length) {
        return NextResponse.json(
          { error: "这一批模型没给有效内容，可稍后重试" },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, points, model, requested: items.length });
    } catch (error) {
      if (error instanceof AiError) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      return NextResponse.json({ error: "这一批生成失败，稍后再试" }, { status: 502 });
    }
  }

  // ── 新版：汇总存档（不调用模型）────────────────────────────────
  if (task === "hot-save") {
    const sections = Array.isArray(body.sections) ? body.sections : [];
    const points: AiReportPoint[] = [];
    const seen = new Set<string>();
    const counts: string[] = [];
    for (const section of sections) {
      const label = typeof section?.label === "string" ? section.label.trim() : "";
      const list = Array.isArray(section?.points) ? (section.points as RawPoint[]) : [];
      let kept = 0;
      for (const raw of list) {
        const title = typeof raw.title === "string" ? raw.title.trim() : "";
        const detail = typeof raw.detail === "string" ? raw.detail.trim() : "";
        if (!title || !detail) continue;
        const url = typeof raw.url === "string" ? raw.url.trim() : "";
        const key = url || title;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push({
          title,
          detail,
          source: typeof raw.source === "string" ? raw.source.trim() : "",
          url,
        });
        kept += 1;
      }
      if (label && kept) counts.push(`${label} ${kept} 条`);
    }
    if (points.length === 0) {
      return NextResponse.json({ error: "没有可保存的解读内容" }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const report = writeAiReport({
      task: "全量热点解读",
      model: typeof body.model === "string" ? body.model : "",
      headline: `全量热点解读 · ${points.length} 条`,
      overview: `${today} 共 ${points.length} 条：${counts.join(" · ")}。下面按平台逐条解说，点标题可回原文。`,
      points,
    });
    return NextResponse.json({ ok: true, report });
  }

  return NextResponse.json({ error: `暂不支持的 task：${task}` }, { status: 400 });
}
