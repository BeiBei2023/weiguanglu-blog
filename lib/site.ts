/**
 * 站点身份：全部可用环境变量覆盖（见 `.env.example`）。
 * 默认值偏中性（「我的博客」），适合本地跑通；线上请在 `.env` 里填写自己的信息。
 * 注意：这些值都是「填写式」的 —— 请勿把真实信息写回代码/仓库（.env 已被 gitignore）。
 */
const env = (key: string, fallback = ""): string => process.env[key]?.trim() || fallback;

const url = env("SITE_URL", "http://localhost:3000").replace(/\/+$/, "");
const policeCode = env("SITE_POLICE_CODE");

export const site = {
  /** 站点名（导航 / 页脚 / 元信息 / RSS） */
  name: env("SITE_NAME", "我的博客"),
  /** 一句话口号（页脚 / 关于页 / llms.txt；留空则不显示） */
  slogan: env("SITE_SLOGAN"),
  /** 站点地址（用于 RSS / sitemap / 分享 / 备份文档等） */
  url,
  /** 建站日 YYYY-MM-DD（页脚「建站 N 天」；留空则不显示） */
  startDate: env("SITE_START_DATE"),
  /** GitHub 用户名（关于页 / 友链 / 侧栏 GitHub 卡片；留空则相关入口隐藏） */
  github: env("SITE_GITHUB"),
  icp: {
    /** ICP 备案号文本（页脚；留空则不显示） */
    text: env("SITE_ICP"),
    href: "https://beian.miit.gov.cn/",
  },
  police: {
    /** 公安备案号文本（页脚；留空则不显示） */
    text: env("SITE_POLICE"),
    /** 备案号查询码（生成页脚链接；留空则无链接） */
    href: policeCode
      ? `https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(policeCode)}`
      : "",
  },
} as const;
