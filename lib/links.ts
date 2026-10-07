/**
 * 友链名单：想加谁就往数组里加一条（也适合放自己的其他站点）。
 * 头像可留空，留空时页面会显示站点名首字。
 */
export interface FriendLink {
  /** 站点名 */
  name: string;
  /** 站点地址（https:// 开头） */
  url: string;
  /** 一句话介绍 */
  description: string;
  /** 头像/图标；留空显示首字 */
  avatar?: string;
  /** 标签，便于分类（如 嵌入式 / Homelab） */
  tags?: string[];
}

export const FRIEND_LINKS: FriendLink[] = [];
