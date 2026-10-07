/**
 * 工作站各页共用的展示格式化。
 *
 * 之前 `formatBytes` / `clock` / `timeAgo` 在每个页面各抄一份，
 * 小数位、时区写法、是否随 ticker 刷新都不一致；统一到这里。
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** `MM-DD HH:mm`（本地时区）；非法或空值原样返回 / `-` */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 相对时间；传 `now` 可由 ticker 驱动实时刷新，不传则用当前时间 */
export function formatAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "-";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return String(iso);
  const diff = now - time;
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
