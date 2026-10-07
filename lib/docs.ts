import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "文档");
const SLUG_RE = /^[A-Za-z0-9._-]+$/;

export interface DocEntry {
  /** 文件名去掉 .md */
  slug: string;
  /** 文档里的第一个 # 标题，取不到就用文件名 */
  title: string;
  bytes: number;
  updatedAt: string;
}

function titleOf(markdown: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : fallback;
}

/** 列出 `文档/` 下的所有 md */
export function listDocs(): DocEntry[] {
  try {
    return fs
      .readdirSync(DOCS_DIR, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && entry.name.toLowerCase().endsWith(".md") && !entry.name.startsWith("."),
      )
      .map((entry) => {
        const file = path.join(DOCS_DIR, entry.name);
        const stat = fs.statSync(file);
        const text = fs.readFileSync(file, "utf8");
        return {
          slug: entry.name.replace(/\.md$/i, ""),
          title: titleOf(text, entry.name),
          bytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}

/** 读单个文档（slug 白名单 + basename 校验，防路径穿越） */
export function readDoc(
  slug: string,
): { title: string; markdown: string; updatedAt: string; bytes: number } | null {
  if (!SLUG_RE.test(slug)) return null;
  const fileName = `${slug}.md`;
  const file = path.join(DOCS_DIR, fileName);
  if (path.basename(file) !== fileName) return null;
  try {
    const stat = fs.statSync(file);
    const markdown = fs.readFileSync(file, "utf8");
    return {
      title: titleOf(markdown, slug),
      markdown,
      updatedAt: stat.mtime.toISOString(),
      bytes: stat.size,
    };
  } catch {
    return null;
  }
}
