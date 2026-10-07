---
title: "第一篇文章：把博客跑起来"
date: 2026-01-01
tags: [随笔]
description: "仓库自带的样例文章：演示 frontmatter 字段与常用 Markdown 写法，可以直接删掉。"
visibility: public
---

这是一篇**样例文章**，用来演示 frontmatter 字段和常见的 Markdown 写法。
写你自己的第一篇时，把 `content/posts/` 下的这个文件删掉或改名都行。

## frontmatter 字段

```yaml
---
title: "标题（必填）"
date: 2026-01-01            # 必填，YYYY-MM-DD
tags: [标签一, 标签二]        # 可选
description: "一句话摘要"    # 可选，列表 / SEO / 分享卡片用
visibility: public          # public | login | draft，不写按 draft 处理
series: "系列名"             # 可选，系列页会聚合
updated: 2026-01-02         # 可选
---
```

## 常用写法

表格：

| 字段 | 说明 |
| --- | --- |
| visibility | `public` 所有人可见；`login` 仅登录可见；`draft` 草稿 |

代码块（构建时用 shiki 高亮，亮/暗双主题）：

```ts
export function hello(name: string) {
  return `你好，${name}`;
}
```

引用与列表：

> 靡不有初，鲜克有终。

- 列表项一
- 列表项二

图片：把文件放到 `content/images/`，然后 `![说明](/images/example.png)`。
