# 分享卡片字体

`smiley-sans-oblique.ttf` = **得意黑 Smiley Sans**（Oblique），用于每篇文章的分享卡片
（`app/posts/[slug]/opengraph-image.tsx`，即 og:image 兜底图）。

- 来源：https://github.com/atelier-anchor/smiley-sans （v2.0.1 发布包里的 TTF）
- 授权：SIL Open Font License 1.1（可自由使用/分发，保留本说明即可）
- 为什么用它：中文字形完整（OG 卡片标题是中文，satori 默认字体没有 CJK 会变豆腐块），
  并且 satori（`next/og`）只认 TTF/OTF/WOFF，不认 woff2 —— 仓库里原有的 Inter 只有 woff2。

如果要换字体：换成带中文的 TTF/OTF 放到这里，改 `opengraph-image.tsx` 里的文件名即可。
