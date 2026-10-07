/**
 * giscus 评论区配置（GitHub Discussions 承载）。
 * 到 https://giscus.app/zh-CN 生成配置后，把 repo / repo-id / category-id 填进 `.env` 即可启用。
 * 任一为空时评论区不渲染（安全默认）。
 */
const env = (key: string): string => process.env[key]?.trim() ?? "";

/** giscus 要求 `owner/repo` 形式；未填写时评论区不渲染（见下方 commentsEnabled） */
const repo = env("COMMENTS_REPO") as `${string}/${string}`;

export const GISCUS = {
  repo,
  repoId: env("COMMENTS_REPO_ID"),
  category: env("COMMENTS_CATEGORY") || "Announcements",
  categoryId: env("COMMENTS_CATEGORY_ID"),
  mapping: "pathname",
  reactionsEnabled: "1",
  inputPosition: "bottom",
  lang: "zh-CN",
  themeDark: "transparent_dark",
  themeLight: "light",
} as const;

export const commentsEnabled =
  GISCUS.repo.length > 0 && GISCUS.repoId.length > 0 && GISCUS.categoryId.length > 0;
