import fs from "node:fs";
import path from "node:path";
import { runZenChat } from "./ai";

/**
 * 单条热点的 AI 详细解说。
 *
 * 与「今日重点」那份解读一样：**只有用户在详情页手动点按钮才会调用**，
 * 生成后存 `data/ai-items/<id>.json`（随备份走），下次打开直接看缓存。
 */

const DIR = path.join(process.cwd(), "data", "ai-items");
const MAX_NOTES = 300;
const ID_RE = /^[a-f0-9]{8,32}$/;

export interface AiItemNote {
  id: string;
  at: string;
  model: string;
  title: string;
  url: string;
  text: string;
}

function fileOf(id: string): string {
  return path.join(DIR, `${id}.json`);
}

export function readAiItemNote(id: string): AiItemNote | null {
  if (!ID_RE.test(id)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fileOf(id), "utf8")) as AiItemNote;
    if (!raw || typeof raw.text !== "string" || !raw.text.trim()) return null;
    return raw;
  } catch {
    return null;
  }
}

function prune(): void {
  try {
    const files = fs.readdirSync(DIR).filter((name) => name.endsWith(".json"));
    if (files.length <= MAX_NOTES) return;
    const entries = files
      .map((name) => ({ name, time: fs.statSync(path.join(DIR, name)).mtimeMs }))
      .sort((a, b) => a.time - b.time);
    for (const entry of entries.slice(0, entries.length - MAX_NOTES)) {
      fs.unlinkSync(path.join(DIR, entry.name));
    }
  } catch {
    // 清理失败无所谓
  }
}

export async function explainHotItem(input: {
  id: string;
  title: string;
  url: string;
  meta?: string;
  summary?: string;
}): Promise<AiItemNote> {
  if (!ID_RE.test(input.id)) throw new Error("条目 id 不对");

  const system = [
    "你是一位中文技术编辑，帮读者把一条资讯讲透。",
    "要求：",
    "1) 第一段用一两句说清这条内容到底在讲什么；",
    "2) 接着展开 3–6 段，讲清关键信息与数据、涉及的技术 / 人物 / 事件背景，以及它对读者的实际意义；",
    "3) 原文信息不足时直说「原文没有更多细节」，不要编造事实或数字；",
    "4) 全程中文，不要复读标题，不要写「本文将介绍」这类套话。",
  ].join("\n");

  const user = [
    `标题：${input.title}`,
    input.meta ? `来源与数据：${input.meta}` : "",
    input.summary ? `原文摘要：${input.summary}` : "",
    `链接：${input.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { text, model } = await runZenChat([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  const trimmed = text.trim();
  if (!trimmed) throw new Error("模型没有返回内容，换个模型再试");

  const note: AiItemNote = {
    id: input.id,
    at: new Date().toISOString(),
    model,
    title: input.title,
    url: input.url,
    text: trimmed,
  };

  fs.mkdirSync(DIR, { recursive: true });
  const file = fileOf(input.id);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(note, null, 2));
  fs.renameSync(tmp, file);
  prune();

  return note;
}
