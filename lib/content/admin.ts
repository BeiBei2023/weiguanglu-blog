import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import matter from "gray-matter";
import { invalidateContentCache } from "./index";
import { invalidateSearchCache } from "@/lib/search";
import type { Visibility } from "./types";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PostInput {
  title: string;
  date: string;
  tags: string[];
  description: string;
  visibility: Visibility;
  /** 系列 / 专栏名（可空） */
  series: string;
  /** 系列内序号（可空，越小越靠前） */
  seriesOrder: number | null;
  content: string;
}

function parseVisibility(value: unknown): Visibility {
  return value === "public" || value === "login" || value === "draft" ? value : "draft";
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseOrder(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseInput(body: Record<string, unknown>): PostInput {
  return {
    title: String(body.title ?? "").trim(),
    date: String(body.date ?? "").slice(0, 10),
    tags: parseTags(body.tags),
    description: String(body.description ?? "").trim(),
    visibility: parseVisibility(body.visibility),
    series: String(body.series ?? "").trim(),
    seriesOrder: parseOrder(body.seriesOrder),
    content: String(body.content ?? ""),
  };
}

export interface SaveResult {
  ok: true;
  version: string;
}
export type UpdateResult =
  | SaveResult
  | { conflict: true; version: string }
  | { error: string; status: number };

function hashOf(raw: string): string {
  return createHash("sha1").update(raw).digest("hex");
}

function postPath(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new Error("非法 slug");
  return path.join(POSTS_DIR, `${slug}.md`);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function readPostRaw(slug: string): { raw: string; hash: string } | null {
  if (!SLUG_RE.test(slug)) return null;
  const file = postPath(slug);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  return { raw, hash: hashOf(raw) };
}

function serialize(input: PostInput): string {
  const body = input.content.endsWith("\n") ? input.content : `${input.content}\n`;
  return matter.stringify(body, {
    title: input.title,
    date: input.date,
    tags: input.tags,
    description: input.description,
    visibility: input.visibility,
    ...(input.series ? { series: input.series } : {}),
    ...(input.seriesOrder != null ? { seriesOrder: input.seriesOrder } : {}),
  });
}

function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, file);
}

function invalidateAll(): void {
  invalidateContentCache();
  invalidateSearchCache();
}

export function createPost(slug: string, input: PostInput): UpdateResult {
  if (!isValidSlug(slug)) {
    return { error: "slug 只能是小写英文、数字与连字符", status: 400 };
  }
  const file = postPath(slug);
  if (fs.existsSync(file)) {
    return { error: "该 slug 已存在", status: 409 };
  }
  writeAtomic(file, serialize(input));
  invalidateAll();
  return { ok: true, version: hashOf(fs.readFileSync(file, "utf8")) };
}

export function updatePost(
  slug: string,
  input: PostInput,
  expectedVersion: string | undefined,
  force: boolean,
): UpdateResult {
  const current = readPostRaw(slug);
  if (!current) return { error: "文章不存在", status: 404 };
  if (!force && expectedVersion && current.hash !== expectedVersion) {
    return { conflict: true, version: current.hash };
  }
  const file = postPath(slug);
  writeAtomic(file, serialize(input));
  invalidateAll();
  return { ok: true, version: hashOf(fs.readFileSync(file, "utf8")) };
}

export function deletePost(slug: string): UpdateResult {
  const current = readPostRaw(slug);
  if (!current) return { error: "文章不存在", status: 404 };
  fs.unlinkSync(postPath(slug));
  invalidateAll();
  return { ok: true, version: "" };
}
