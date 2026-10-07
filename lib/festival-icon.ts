/**
 * 节日 SVG 生成（服务端）：节日当天 favicon、页脚徽标都用它
 *
 * 为什么用 SVG：不用为每个节日准备 PNG 素材，改配色/表情只改一处；
 * 浏览器 favicon 支持 SVG（Chrome / Edge / Firefox / Safari 都行）。
 */

import type { FestivalEntry } from "./festival-defaults";

/** 圣诞帽之类不用——只过中国传统节日，图形取自 emoji 本身 */

/** 深色底 + 主色光晕 + 大 emoji 的方形图标 */
export function festivalIconSvg(festival: FestivalEntry, size = 64): string {
  const { color, emoji } = festival;
  const rx = size * 0.22;
  const fontSize = size * 0.56;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>
<radialGradient id="g" cx="30%" cy="18%" r="90%">
<stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
<stop offset="55%" stop-color="${color}" stop-opacity="0.55"/>
<stop offset="100%" stop-color="${color}" stop-opacity="0.28"/>
</radialGradient>
</defs>
<rect width="${size}" height="${size}" rx="${rx}" fill="#141210"/>
<rect width="${size}" height="${size}" rx="${rx}" fill="url(#g)"/>
<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}">${emoji}</text>
</svg>`;
}

/** 页脚徽标：小圆角胶囊，emoji + 祝福文案在 HTML 里排，这里只出图标 */
export function festivalBadgeSvg(festival: FestivalEntry, size = 20): string {
  return festivalIconSvg(festival, size);
}
