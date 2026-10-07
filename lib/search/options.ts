import type { Options } from "minisearch";
import { tokenizeText } from "./tokenize";

export type SearchDoc = {
  id: string;
  title: string;
  tags: string;
  description: string;
  content: string;
};

export const SEARCH_FIELDS = ["title", "tags", "description", "content"] as const;

export const SEARCH_OPTIONS = {
  prefix: true,
  fuzzy: 0.2,
  boost: { title: 3, tags: 2 },
} as const;

/** 服务端建索引与客户端加载索引必须使用同一套 options */
export function createSearchOptions(): Options<SearchDoc> {
  return {
    idField: "id",
    fields: [...SEARCH_FIELDS],
    storeFields: ["title", "description", "tags"],
    tokenize: tokenizeText,
    searchOptions: { ...SEARCH_OPTIONS },
  };
}
