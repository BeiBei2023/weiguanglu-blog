import type { LucideIcon } from "lucide-react";
import { Archive, BarChart3, CloudSun, Code2, Compass, Cpu, Database, FileText, HeartPulse, Images, MessageSquare, PartyPopper, Radio, Router, Server } from "lucide-react";

export interface ServiceEntry {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** dev=开发中（占位）；省略=已可用 */
  status?: "dev" | "live";
}

/**
 * 工作站服务注册表：加服务 = 加一个路由页 + 这里加一行。
 */
export const SERVICES: ServiceEntry[] = [
  {
    id: "ota",
    name: "ESP32 OTA 升级",
    description: "上传固件、管理版本，设备按 URL 自动拉取升级",
    href: "/w/ota",
    icon: Cpu,
  },
  {
    id: "inventory",
    name: "元器件仓库",
    description: "电子元器件的入库、库存与查找",
    href: "/w/inventory",
    icon: Database,
  },
  {
    id: "mqtt",
    name: "MQTT 服务器",
    description: "给设备发账号，内嵌 broker 收上报、看实时消息",
    href: "/w/mqtt",
    icon: Radio,
  },
  {
    id: "views",
    name: "阅读统计",
    description: "谁看了哪篇文章：访客流水、来源与地区、热门榜",
    href: "/w/views",
    icon: BarChart3,
  },
  {
    id: "health",
    name: "机器体检趋势",
    description: "每小时采样：负载、内存、磁盘占用、CPU / 主板 / 硬盘温度与 SMART 计数",
    href: "/w/health",
    icon: HeartPulse,
  },
  {
    id: "hot",
    name: "热点信息",
    description: "掘金 / IT之家 / 少数派 / GitHub（中文为主），每小时更新（只用公开接口）",
    href: "/w/hot",
    icon: Compass,
  },
  {
    id: "comments",
    name: "评论动态",
    description: "有没有人评论：读 GitHub Discussions 的公开动态，未读一眼可见",
    href: "/w/comments",
    icon: MessageSquare,
  },
  {
    id: "status",
    name: "服务器状态",
    description: "磁盘、端口、备份、部署记录与各模块概况的体检页",
    href: "/w/status",
    icon: Server,
  },
  {
    id: "images",
    name: "素材台",
    description: "拖拽 / 粘贴上传图片，图库浏览、alt 文本、复制 Markdown、回收站",
    href: "/w/images",
    icon: Images,
  },
  {
    id: "festivals",
    name: "节日",
    description: "节日氛围：起止 / 进度 / 动效，可同步国务院放假安排",
    href: "/w/festivals",
    icon: PartyPopper,
  },
  {
    id: "weather",
    name: "天气",
    description: "心知天气实况 + 3 天预报（侧栏挂件）",
    href: "/w/weather",
    icon: CloudSun,
  },
  {
    id: "docs",
    name: "项目文档",
    description: "在线翻阅仓库里的设计 / 施工 / 部署文档",
    href: "/w/docs",
    icon: FileText,
  },
  {
    id: "snippets",
    name: "片段备忘",
    description: "常用命令与代码片段，带标签搜索与一键复制",
    href: "/w/snippets",
    icon: Code2,
  },
  {
    id: "devices",
    name: "设备台账",
    description: "MQTT 设备、绑定固件与最近命令回执一览",
    href: "/w/devices",
    icon: Router,
  },
  {
    id: "backup",
    name: "备份浏览",
    description: "123 云盘上的归档快照与恢复命令",
    href: "/w/backup",
    icon: Archive,
  },
];
