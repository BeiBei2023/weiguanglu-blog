import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Docker 部署：产出精简的 standalone server
  output: "standalone",
  // MQTT broker（aedes）与 IP 地区库解析（maxmind）在 Node 运行时按需 require，不打进 bundle
  serverExternalPackages: ["aedes", "maxmind"],
  async headers() {
    return [
      {
        // 自托管字体：内容不变 → 浏览器缓存一年
        source: "/fonts/:file",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  // 需要旧文章地址 301 到新地址时，在这里加 redirects()（见 Next.js 文档）
};

export default nextConfig;
