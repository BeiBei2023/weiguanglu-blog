import { siteAgeDays } from "@/lib/site-age";

/** 页脚「建站天数」：以域名注册日为起点，按 UTC 计算（各时区一致） */
export function SiteAge() {
  const days = siteAgeDays();
  if (days === null) return null;
  return <span>已建站 {days} 天</span>;
}
