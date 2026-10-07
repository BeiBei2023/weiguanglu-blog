"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server";
import { createSnippet, deleteSnippet, updateSnippet } from "@/lib/snippets";

export interface SnippetActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
}

async function guard(): Promise<SnippetActionResult | null> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };
  return null;
}

/** 支持中英文逗号、空格、换行分隔 */
function splitTags(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function saveSnippetAction(formData: FormData): Promise<SnippetActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const language = String(formData.get("language") ?? "").trim() || "text";
  const tags = splitTags(String(formData.get("tags") ?? ""));
  const content = String(formData.get("content") ?? "");

  if (!title) return { ok: false, error: "标题不能为空" };
  if (!content.trim()) return { ok: false, error: "内容不能为空" };

  const saved = id
    ? updateSnippet(id, { title, language, tags, content })
    : createSnippet({ title, language, tags, content });
  if (!saved) return { ok: false, error: "没找到这条片段，可能已被删除" };

  revalidatePath("/w/snippets");
  return { ok: true, notice: id ? "已更新" : "已保存" };
}

export async function deleteSnippetAction(id: string): Promise<SnippetActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const removed = deleteSnippet(String(id ?? ""));
  if (!removed) return { ok: false, error: "没找到这条片段" };

  revalidatePath("/w/snippets");
  return { ok: true, notice: "已删除" };
}
