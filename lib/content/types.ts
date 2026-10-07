export type Visibility = "public" | "login" | "draft";

export interface PostMeta {
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  tags: string[];
  description: string;
  visibility: Visibility;
  /** 系列 / 专栏名（frontmatter `series`），可选 */
  series?: string;
  /** 系列内序号（frontmatter `seriesOrder`），越小越靠前 */
  seriesOrder?: number;
}

export interface Post extends PostMeta {
  /** Markdown 正文（不含 frontmatter） */
  content: string;
  /** 文件修改时间（ms），用于缓存/冲突判断 */
  updatedAt: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface YearGroup {
  year: string;
  posts: Post[];
}
