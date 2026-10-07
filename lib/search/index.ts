import MiniSearch from "minisearch";
import { getAllPosts, getContentSignature, getPublicPosts, type Post } from "@/lib/content";
import { createSearchOptions, type SearchDoc } from "./options";

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDoc(post: Post): SearchDoc {
  return {
    id: post.slug,
    title: post.title,
    tags: post.tags.join(" "),
    description: post.description,
    content: stripMarkdown(post.content),
  };
}

function build(posts: Post[]): string {
  const index = new MiniSearch<SearchDoc>(createSearchOptions());
  index.addAll(posts.map(toDoc));
  return JSON.stringify(index);
}

interface CachedIndex {
  signature: string;
  json: string;
}

let cache: { public: CachedIndex | null; private: CachedIndex | null } = {
  public: null,
  private: null,
};

/** 供 watcher（M7）在 content/ 变化后调用 */
export function invalidateSearchCache(): void {
  cache = { public: null, private: null };
}

/** 公开索引：仅 public 文章（draft 与 login 均不入） */
export function getPublicIndexJson(): string {
  const signature = getContentSignature();
  if (cache.public && cache.public.signature === signature) return cache.public.json;
  const json = build(getPublicPosts());
  cache.public = { signature, json };
  return json;
}

/** 私有索引：仅 login 文章；接口需登录校验 */
export function getPrivateIndexJson(): string {
  const signature = getContentSignature();
  if (cache.private && cache.private.signature === signature) return cache.private.json;
  const json = build(getAllPosts().filter((p) => p.visibility === "login"));
  cache.private = { signature, json };
  return json;
}
