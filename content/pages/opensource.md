---
title: 开源说明
description: 本站用到的开源项目、直接引用或改写的代码清单与许可说明
---

## 0. 一句话说明

本站站在很多开源项目的肩膀上。这一页把**用到的开源库**与**直接引用或改写的代码**列出来，
标明用途、出处与许可；**所有版权归原作者**。如有遗漏或标注不当，欢迎联系补正或删除。

## 1. 直接引用或改写的开源代码

| 项目 | 作用 | 用在哪里 | 许可 |
| --- | --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com) | 组件源码（按官方方式复制进项目后再定制） | `components/ui/*` | MIT |
| [Radix UI](https://radix-ui.com) | 无样式、无障碍的交互底层（经 shadcn 引入） | `components/ui/*` | MIT |
| [holiday-cn](https://github.com/NateScarlet/holiday-cn) | 中国法定节假日与调休数据 | `lib/holiday-cn.ts` | MIT |
| [Lucide](https://lucide.dev) | 图标集 | 全站界面 | ISC |
| [Yet Another React Lightbox](https://yet-another-react-lightbox.com) | 图片灯箱 | 文章插图 | MIT |
| [得意黑 Smiley Sans](https://github.com/atelier-anchor/smiley-sans) | 分享卡片（og:image）中文字体 | `public/fonts/` | SIL OFL 1.1 |

## 2. 运行时依赖（节选）

Next.js（MIT）、React（MIT）、Tailwind CSS（MIT）、tsParticles（MIT）、
unified / remark / rehype 系列（MIT）、rehype-pretty-code（MIT）、shiki（MIT）、
MiniSearch（MIT）、cmdk（MIT）、Radix UI（MIT）、TanStack Table（MIT）、
ECharts（Apache-2.0）、Recharts（MIT）、giscus（MIT）、Aedes（MIT）、ws（MIT）、lowdb（MIT）、jose（MIT）

完整清单以 `package.json` 与各自包内的 LICENSE 为准。

## 3. 许可合规

- 上述项目版权归各自作者或组织所有，本站按其许可条款使用
- 复制进本项目的源码（如 shadcn/ui 组件）保留出处与许可说明，未移除或篡改任何版权声明
- 若你是权利人，认为本站遗漏、标注不当或使用不当，请联系我补正或删除
