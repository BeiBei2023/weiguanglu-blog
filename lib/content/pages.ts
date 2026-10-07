import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const PAGES_DIR = path.join(process.cwd(), "content", "pages");

export interface PageContent {
  title: string;
  description: string;
  content: string;
}

export function getPage(name: string): PageContent | null {
  const full = path.join(PAGES_DIR, `${name}.md`);
  if (!fs.existsSync(full)) return null;
  const { data, content } = matter(fs.readFileSync(full, "utf8"));
  return {
    title: String(data.title ?? name),
    description: String(data.description ?? ""),
    content: content.trim(),
  };
}
