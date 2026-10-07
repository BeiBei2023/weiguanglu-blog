/**
 * 资源地址展示（客户端可用，不要引入 fs）
 *
 * - 站内已有的本地地址（`/api/...`、`/content-images/...`）原样返回
 * - 远程地址（立创的图片/手册）改走站内代理：首次打开时自动下载到本地并长期复用
 */

export function displayAssetUrl(value: string, kind: "image" | "datasheet"): string {
  const url = value.trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    return `/api/w/inventory/asset?kind=${kind}&src=${encodeURIComponent(url)}`;
  }
  return url;
}
