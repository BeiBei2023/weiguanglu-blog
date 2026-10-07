import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getPublicPosts } from "@/lib/content";
import { site } from "@/lib/site";

/**
 * 每篇文章的分享卡片（og:image）
 * 正文里没有图片时用它兜底：标题 + 日期 + 标签 + 站点名
 * 字体：得意黑 Smiley Sans（OFL-1.1，见 public/fonts/README.md）——中文字形完整，satori 可解析
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const BG = "#0e0f12";
const FG = "#f8f5f0";
const MUTED = "#a9a396";
const PRIMARY = "#e07a52";

let fontCache: Buffer | null = null;

async function loadFont(): Promise<Buffer> {
  if (fontCache) return fontCache;
  fontCache = await fs.readFile(
    path.join(process.cwd(), "public", "fonts", "smiley-sans-oblique.ttf"),
  );
  return fontCache;
}

/** 标题越长字号越小（保证不超过卡片高度） */
function titleSize(length: number): number {
  if (length <= 12) return 86;
  if (length <= 18) return 74;
  if (length <= 26) return 62;
  if (length <= 36) return 54;
  if (length <= 48) return 46;
  return 40;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPublicPosts().find((item) => item.slug === slug);
  const raw = post?.title ?? site.name;
  const title = raw.length > 60 ? `${raw.slice(0, 59)}…` : raw;
  const tags = (post?.tags ?? []).slice(0, 4);
  const date = post?.date ?? "";
  const font = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: BG,
          color: FG,
          padding: "60px 72px",
          fontFamily: "Smiley",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -160,
            width: 640,
            height: 640,
            borderRadius: 640,
            background: `radial-gradient(circle, ${PRIMARY}88 0%, ${PRIMARY}00 70%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -240,
            left: -180,
            width: 560,
            height: 560,
            borderRadius: 560,
            background: `radial-gradient(circle, ${PRIMARY}44 0%, ${PRIMARY}00 70%)`,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                width: 46,
                height: 46,
                borderRadius: 13,
                background: PRIMARY,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* 菱形小标：纯 CSS 画，不依赖字体字形（✦ 这类符号会触发 satori 去下载动态字体） */}
              <div
                style={{
                  display: "flex",
                  width: 16,
                  height: 16,
                  background: "#20120a",
                  borderRadius: 3,
                  transform: "rotate(45deg)",
                }}
              />
            </div>
            <div style={{ display: "flex" }}>{site.name}</div>
          </div>
          {date ? <div style={{ display: "flex", fontSize: 26, color: MUTED }}>{date}</div> : null}
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize(title.length),
              lineHeight: 1.24,
              letterSpacing: 1,
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            {tags.map((tag) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  padding: "5px 16px",
                  borderRadius: 999,
                  border: `1px solid ${PRIMARY}77`,
                  color: "#e9b9a0",
                  fontSize: 24,
                }}
              >
                #{tag}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            {site.url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Smiley", data: font, style: "normal", weight: 400 }],
    },
  );
}
