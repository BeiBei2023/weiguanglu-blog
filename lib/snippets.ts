import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "snippets.json");

/** 单条片段 */
export const snippetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  /** 语言标记（text / sh / ts / python / json …），只用于显示 */
  language: z.string().max(32).default("text"),
  tags: z.array(z.string().max(24)).max(12).default([]),
  content: z.string().max(20000),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Snippet = z.infer<typeof snippetSchema>;

export interface SnippetInput {
  title: string;
  language?: string;
  tags?: string[];
  content: string;
}

interface SnippetsFile {
  snippets: Snippet[];
}

const fileSchema = z.object({
  snippets: z.array(snippetSchema).default([]),
});

function readFromDisk(): SnippetsFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as unknown;
    const result = fileSchema.safeParse(parsed);
    if (!result.success) return { snippets: [] };
    return { snippets: result.data.snippets };
  } catch {
    // 文件不存在或损坏 → 视为空
    return { snippets: [] };
  }
}

function writeToDisk(data: SnippetsFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, FILE);
}

/** 全部片段，最近更新的在前 */
export function listSnippets(): Snippet[] {
  return readFromDisk().snippets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSnippet(id: string): Snippet | null {
  return readFromDisk().snippets.find((item) => item.id === id) ?? null;
}

function normalizeTags(tags: string[] | undefined): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const value = String(tag).trim().slice(0, 24);
    if (value && !out.includes(value)) out.push(value);
  }
  return out.slice(0, 12);
}

export function createSnippet(input: SnippetInput): Snippet {
  const data = readFromDisk();
  const now = new Date().toISOString();
  const snippet: Snippet = {
    id: crypto.randomUUID(),
    title: input.title.trim().slice(0, 120) || "未命名片段",
    language: (input.language ?? "text").trim().slice(0, 32) || "text",
    tags: normalizeTags(input.tags),
    content: input.content.slice(0, 20000),
    createdAt: now,
    updatedAt: now,
  };
  data.snippets.push(snippet);
  writeToDisk(data);
  return snippet;
}

export function updateSnippet(id: string, input: SnippetInput): Snippet | null {
  const data = readFromDisk();
  const index = data.snippets.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = data.snippets[index];
  const next: Snippet = {
    ...current,
    title: input.title.trim().slice(0, 120) || current.title,
    language: (input.language ?? "text").trim().slice(0, 32) || "text",
    tags: normalizeTags(input.tags),
    content: input.content.slice(0, 20000),
    updatedAt: new Date().toISOString(),
  };
  data.snippets[index] = next;
  writeToDisk(data);
  return next;
}

export function deleteSnippet(id: string): boolean {
  const data = readFromDisk();
  const next = data.snippets.filter((item) => item.id !== id);
  if (next.length === data.snippets.length) return false;
  writeToDisk({ snippets: next });
  return true;
}

export function snippetStats(): { total: number; tags: number; bytes: number } {
  const snippets = readFromDisk().snippets;
  const tags = new Set<string>();
  let bytes = 0;
  for (const item of snippets) {
    for (const tag of item.tags) tags.add(tag);
    bytes += Buffer.byteLength(item.content, "utf8");
  }
  return { total: snippets.length, tags: tags.size, bytes };
}
