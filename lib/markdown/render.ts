import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode, { type Options as PrettyCodeOptions } from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Element, Root, Text } from "hast";
import { readAltMap } from "@/lib/images";

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

const prettyCodeOptions: PrettyCodeOptions = {
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
  keepBackground: false,
  // 给每个代码块加 data-line-numbers，配合 CSS counters 显示行号
  transformers: [
    {
      pre(node) {
        node.properties = { ...node.properties, "data-line-numbers": "" };
      },
    },
  ],
};

function textOf(node: Element): string {
  let out = "";
  visit(node, "text", (n) => {
    out += (n as Text).value;
  });
  return out.trim();
}

/** 正文里的相对图片路径（如 `images/foo.png`、`./foo.png`、`foo.png`）→ `/content-images/…` */
function rehypeLocalImages() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      if (typeof src !== "string" || src.length === 0) return;
      // 绝对路径 / 协议 / 锚点 一律不动
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src)) return;
      const clean = src.replace(/^\.\//, "").replace(/^images\//i, "");
      node.properties = { ...node.properties, src: `/content-images/${clean}` };
    });
  };
}

/** 正文图片没写 alt 时，用素材台里的 alt 文本（data/image-alt.json）补上（利于 SEO 与读屏） */
function rehypeImageAlt() {
  const map = readAltMap();
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const alt = node.properties?.alt;
      if (typeof alt === "string" && alt.trim()) return;
      const src = node.properties?.src;
      if (typeof src !== "string") return;
      const match = /\/content-images\/([A-Za-z0-9._-]+)$/.exec(src);
      if (!match) return;
      const text = map[decodeURIComponent(match[1])];
      if (!text) return;
      node.properties = { ...node.properties, alt: text };
    });
  };
}

/**
 * 正文里的一级标题降为二级：文章页本身已经渲染了唯一的 h1（文章标题），
 * 正文再出现 h1 就会变成「一页多个 h1」，对搜索引擎不友好。
 * 只在文章页开启（静态页的正文 h1 就是它唯一的 h1，不能降）。
 */
function rehypeDemoteH1() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "h1") node.tagName = "h2";
    });
  };
}

function buildProcessor(demoteH1 = false) {
  let processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug);
  if (demoteH1) processor = processor.use(rehypeDemoteH1);
  return processor
    .use(rehypeLocalImages)
    .use(rehypeImageAlt)
    .use(rehypePrettyCode, prettyCodeOptions)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/**
 * 渲染结果缓存：同一份 Markdown 只解析 + 高亮一次。
 * 文章页是 force-dynamic、每次请求都会调 renderMarkdown，而 rehype-pretty-code（Shiki）
 * 高亮是主要开销 → 缓存后重复访问的 TTFB 明显下降。键就是 Markdown 原文（改了自然失效）。
 * 注：alt 文本（data/image-alt.json）是在构建处理器时读取的，改 alt 后需等正文变动或进程重启。
 */
const RENDER_CACHE_MAX = 50;
const renderCache = new Map<string, { html: string; toc: TocItem[] }>();

/** 把 Markdown 渲染为 HTML，同时抽取 h2–h4 目录（id 与 rehype-slug 保持一致） */
export async function renderMarkdown(
  markdown: string,
  options?: { demoteH1?: boolean },
): Promise<{ html: string; toc: TocItem[] }> {
  const demoteH1 = options?.demoteH1 === true;
  // 缓存键带模式前缀：同一份原文在「正文页」与「静态页」下的产物不同
  const cacheKey = (demoteH1 ? "h1>h2:" : "") + markdown;
  const hit = renderCache.get(cacheKey);
  if (hit) return hit;

  const processor = buildProcessor(demoteH1);
  const mdast = processor.parse(markdown);
  const hast = (await processor.run(mdast)) as unknown as Root;

  const toc: TocItem[] = [];
  visit(hast, "element", (node) => {
    const match = /^h([2-4])$/.exec(node.tagName);
    const id = node.properties?.id;
    if (match && typeof id === "string") {
      toc.push({ id, text: textOf(node), depth: Number(match[1]) });
    }
  });

  const html = processor.stringify(hast);
  const result = { html, toc };
  renderCache.set(cacheKey, result);
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return result;
}
