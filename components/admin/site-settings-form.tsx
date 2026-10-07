"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Image as ImageIcon,
  LayoutPanelLeft,
  Palette,
  Save,
  Wallpaper,
  type LucideIcon,
} from "lucide-react";
import type { SiteConfig } from "@/lib/site-config";
import { DEFAULT_FESTIVALS as FESTIVALS } from "@/lib/festival-defaults";
import { SidebarLayoutEditor } from "@/components/admin/sidebar-layout-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from "@/lib/widgets/catalog";
import {
  MAX_IMAGE_UPLOAD,
  MAX_VIDEO_UPLOAD,
  formatBytes,
  formatSpeed,
  uploadWithProgress,
  type UploadProgressInfo,
  type UploadTask,
} from "@/lib/upload";

type StringKey =
  | "logo"
  | "logoLight"
  | "avatar"
  | "favicon"
  | "faviconDark"
  | "background"
  | "backgroundVideo";

const FIELDS: {
  key: StringKey;
  label: string;
  hint: string;
  accept?: string;
  video?: boolean;
}[] = [
  { key: "logo", label: "站点 Logo（暗色）", hint: "暗色主题下导航左侧的小图（方形）" },
  { key: "logoLight", label: "站点 Logo（亮色）", hint: "亮色主题下导航左侧的小图（方形）" },
  { key: "favicon", label: "站点图标（亮色/默认）", hint: "浏览器标签页图标（方形）" },
  { key: "faviconDark", label: "站点图标（暗色）", hint: "系统/浏览器为暗色时使用" },
  { key: "avatar", label: "头像", hint: "关于页顶部头像" },
  { key: "background", label: "网站背景照片", hint: "留空则无背景；设了视频时它作为封面/降级图" },
  {
    key: "backgroundVideo",
    label: "网站背景视频（可选）",
    hint: "mp4/webm 短循环（上限 60MB，强烈建议压到 720p/≤3MB）；设置后优先播放视频，系统「减少动态效果」时回落到背景图",
    accept: "video/mp4,video/webm,video/quicktime,video/ogg",
    video: true,
  },
];

/** 字段分组 */
const IDENTITY_KEYS: StringKey[] = ["logo", "logoLight", "favicon", "faviconDark", "avatar"];
const BACKGROUND_KEYS: StringKey[] = ["background", "backgroundVideo"];

export function SiteSettingsForm({ initial }: { initial: SiteConfig }) {
  const router = useRouter();
  const [values, setValues] = useState<SiteConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState<(UploadProgressInfo & { key: string }) | null>(null);
  const taskRef = useRef<UploadTask | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof SiteConfig, value: string | number) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setPanelStyle(style: "dark" | "light") {
    setValues((current) => ({ ...current, panelStyle: style }));
  }

  function setImageHotlink(mode: "off" | "relaxed" | "strict") {
    setValues((current) => ({ ...current, imageHotlink: mode }));
  }

  function setFestival(mode: string) {
    setValues((current) => ({ ...current, festival: mode }));
  }

  async function upload(key: keyof SiteConfig, file: File) {
    const isVideo = file.type.startsWith("video/");
    const limit = isVideo ? MAX_VIDEO_UPLOAD : MAX_IMAGE_UPLOAD;
    if (file.size > limit) {
      setError(`${isVideo ? "视频" : "图片"}过大（上限 ${isVideo ? "60MB" : "10MB"}）`);
      return;
    }
    setUploading(key);
    setError(null);
    setProgress({ key, loaded: 0, total: file.size, percent: 0, speed: 0, eta: 0, sent: false });
    const task = uploadWithProgress(file, (info) => setProgress({ key, ...info }));
    taskRef.current = task;
    try {
      const { path } = await task.promise;
      set(key, path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      taskRef.current = null;
      setUploading(null);
      setProgress(null);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setMessage("已保存");
      router.refresh();
    } catch {
      setError("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  }

  // 面板风格即时预览：切换按钮立刻看到效果（点保存才写入）；离开还原
  useEffect(() => {
    document.body.classList.toggle("panel-light", values.panelStyle === "light");
  }, [values.panelStyle]);

  useEffect(() => {
    return () => {
      document.body.classList.toggle("panel-light", initial.panelStyle === "light");
    };
  }, [initial]);

  // 背景即时预览：改地址 / 拖动模糊、遮罩滑杆立即生效（点「保存」才写入配置）
  const applyBackgroundPreview = useCallback(
    (config: {
      background: string;
      backgroundVideo: string;
      backgroundBlur: number;
      backgroundDim: number;
    }) => {
      const video = document.querySelector<HTMLVideoElement>("[data-wgl-bg-video]");
      const image = document.querySelector<HTMLElement>("[data-wgl-bg]");
      const dim = document.querySelector<HTMLElement>("[data-wgl-bg-dim]");
      if (!image || !dim) return;
      const filter = config.backgroundBlur > 0 ? `blur(${config.backgroundBlur}px)` : "";
      const transform = config.backgroundBlur > 0 ? "scale(1.06)" : "";

      if (config.backgroundVideo && video) {
        video.style.display = "";
        video.style.filter = filter;
        video.style.transform = transform;
        if (video.getAttribute("src") !== config.backgroundVideo) {
          video.setAttribute("src", config.backgroundVideo);
          void video.play().catch(() => {});
        }
        image.style.display = "none";
      } else {
        if (video) video.style.display = "none";
        if (config.background) {
          image.style.display = "";
          image.style.backgroundImage = `url(${config.background})`;
          image.style.filter = filter;
          image.style.transform = transform;
        } else {
          image.style.display = "none";
        }
      }

      if (config.background || config.backgroundVideo) {
        dim.style.display = "";
        dim.style.opacity = String(config.backgroundDim / 100);
      } else {
        dim.style.display = "none";
      }
    },
    [],
  );

  useEffect(() => {
    applyBackgroundPreview(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在这些字段变化时重放预览
  }, [values.background, values.backgroundVideo, values.backgroundBlur, values.backgroundDim]);

  // 离开设置页时把背景还原为已保存的值（未保存的预览不残留）
  useEffect(() => {
    return () => {
      applyBackgroundPreview(initial);
    };
  }, [initial, applyBackgroundPreview]);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  function fieldRow(field: (typeof FIELDS)[number]) {
    const value = values[field.key];
    const busy = uploading === field.key;
    return (
      <div key={field.key} className="py-4 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium">{field.label}</label>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              {busy ? (progress?.sent ? "处理中…" : `上传中 ${progress?.percent ?? 0}%`) : "上传"}
              <input
                type="file"
                accept={field.accept ?? "image/*"}
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(field.key, file);
                  event.target.value = "";
                }}
              />
            </label>
            {value ? (
              <button
                type="button"
                onClick={() => set(field.key, "")}
                className="text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                清除
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
        {busy && progress ? (
          <div className="mt-2 space-y-1.5" data-upload-progress>
            <Progress value={progress.percent} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{progress.percent}%</span>
              <span>
                {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
              </span>
              {progress.speed > 0 ? (
                <span className="font-mono">{formatSpeed(progress.speed)}</span>
              ) : null}
              {progress.sent ? (
                <span>上传完成，服务端处理中…</span>
              ) : progress.eta > 0 ? (
                <span>剩余约 {Math.ceil(progress.eta)} 秒</span>
              ) : null}
              <button
                type="button"
                onClick={() => taskRef.current?.abort()}
                className="text-destructive transition-opacity hover:opacity-80"
              >
                取消
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-3">
          {value ? (
            field.video ? (
              <video
                src={value}
                muted
                loop
                autoPlay
                playsInline
                className="h-12 w-20 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt=""
                className={
                  field.key === "background"
                    ? "h-12 w-20 shrink-0 rounded-lg border border-border object-cover"
                    : "h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
                }
              />
            )
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">（未设置）</span>
          )}
          <input
            value={value}
            onChange={(event) => set(field.key, event.target.value)}
            placeholder={field.video ? "视频地址或 /content-images/…" : "图片地址或 /content-images/…"}
            className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 站点标识 */}
      <section className="glass rounded-3xl p-5">
        <SectionHead
          icon={ImageIcon}
          title="站点标识"
          hint="Logo、图标与头像（方形图片效果最好）"
        />
        <div className="mt-4 divide-y divide-border">
          {FIELDS.filter((field) => IDENTITY_KEYS.includes(field.key)).map(fieldRow)}
        </div>
      </section>

      {/* 背景 */}
      <section className="glass rounded-3xl p-5">
        <SectionHead
          icon={Wallpaper}
          title="背景"
          hint="照片或视频、模糊与遮罩；拖动滑杆即时预览"
        />
        <div className="mt-4 divide-y divide-border">
          {FIELDS.filter((field) => BACKGROUND_KEYS.includes(field.key)).map(fieldRow)}

          <div className="py-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">背景模糊</label>
              <span className="font-mono text-xs text-muted-foreground">
                {values.backgroundBlur}px
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              模糊背景以降噪、提升文字可读性（0 = 不模糊；建议 8–20）
            </p>
            <input
              type="range"
              min={0}
              max={40}
              value={values.backgroundBlur}
              onChange={(event) => set("backgroundBlur", Number(event.target.value))}
              className="mt-3 w-full"
              style={{ accentColor: "var(--primary)" }}
            />
          </div>

          <div className="py-4 last:pb-0">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">背景遮罩</label>
              <span className="font-mono text-xs text-muted-foreground">
                {values.backgroundDim}%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              整体压暗程度（0 = 背景最亮，100 = 全被底色盖住）；配合「背景模糊」一起用最好
            </p>
            <input
              type="range"
              min={0}
              max={100}
              value={values.backgroundDim}
              onChange={(event) => set("backgroundDim", Number(event.target.value))}
              className="mt-3 w-full"
              style={{ accentColor: "var(--primary)" }}
            />
          </div>

          <div className="py-4 last:pb-0">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">代码块折叠行数</label>
              <span className="font-mono text-xs text-muted-foreground">
                {values.codeCollapseLines > 0 ? `${values.codeCollapseLines} 行` : "不折叠"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              文章里的代码块超过这个行数时默认折叠，可点按钮展开；0 = 不折叠（全部展开）
            </p>
            <input
              type="number"
              min={0}
              max={200}
              value={values.codeCollapseLines}
              onChange={(event) => set("codeCollapseLines", Number(event.target.value))}
              className="mt-3 w-28 rounded-xl border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </section>

      {/* 外观与安全 */}
      <section className="glass rounded-3xl p-5">
        <SectionHead icon={Palette} title="外观与安全" hint="面板风格、节日氛围与图片防盗链" />
        <div className="mt-4 divide-y divide-border">
          <div className="py-4 first:pt-0">
            <label className="text-sm font-medium">面板风格</label>
            <p className="mt-1 text-xs text-muted-foreground">
              深色玻璃（默认，浅色字）／浅色磨砂（<strong className="text-foreground">黑字</strong>
              ，配合花亮背景更清楚）。管理区不受影响。
            </p>
            <div className="mt-3 inline-flex rounded-full border border-border p-0.5">
              {(["dark", "light"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setPanelStyle(style)}
                  className={`rounded-full px-3.5 py-1 text-xs transition-colors ${
                    values.panelStyle === style
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {style === "dark" ? "深色玻璃" : "浅色磨砂（黑字）"}
                </button>
              ))}
            </div>
          </div>

          <div className="py-4">
            <label className="text-sm font-medium">节日氛围</label>
            <p className="mt-1 text-xs text-muted-foreground">
              自动：按日期识别节日（中国法定节日、小节日，以及你的生日农历七月廿七、建站周年 9-27；不过西方节日）。命中当天会飘粒子、背景光晕换色、页脚出现节日小徽标、浏览器图标也变成节日版。也可以指定某个节日来预览效果，或整体关闭。
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  { id: "auto", label: "自动（按节日）" },
                  { id: "off", label: "关闭" },
                  ...FESTIVALS.map((item) => ({ id: item.id, label: `${item.emoji} ${item.name}` })),
                ] as { id: string; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFestival(item.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    values.festival === item.id
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {values.festival !== "auto" && values.festival !== "off" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                正在固定展示：{FESTIVALS.find((item) => item.id === values.festival)?.name ?? values.festival}
                （仅供预览，节日过后记得改回「自动」）
              </p>
            ) : null}
          </div>

          <div className="py-4 last:pb-0">
            <label className="text-sm font-medium">图片防盗链</label>
            <p className="mt-1 text-xs text-muted-foreground">
              宽松：只有「其他网站引用本站图片」时才拒绝（推荐；直接粘贴链接仍可看）；严格：必须来自本站页面；关闭：不限制。
            </p>
            <div className="mt-3 inline-flex rounded-full border border-border p-0.5">
              {(["off", "relaxed", "strict"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setImageHotlink(mode)}
                  className={`rounded-full px-3.5 py-1 text-xs transition-colors ${
                    values.imageHotlink === mode
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "off" ? "关闭" : mode === "relaxed" ? "宽松（推荐）" : "严格"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 侧栏布局 */}
      <section className="glass rounded-3xl p-5">
        <SectionHead
          icon={LayoutPanelLeft}
          title="侧栏布局"
          hint="↑↓ 调顺序 · ←/→ 换列 · ✕ 隐藏（放回：左/右）；右列 ≥1024px、左列 ≥1280px 显示，保存后生效"
        />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["left", "right"] as const).map((side) => (
            <div key={side} className="rounded-2xl border border-border/70 p-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">
                  {side === "left" ? "左列宽度" : "右列宽度"}
                </label>
                <span className="font-mono text-xs text-muted-foreground">
                  {values.sidebarWidth[side]}px
                </span>
              </div>
              <input
                type="range"
                min={SIDEBAR_WIDTH_MIN}
                max={SIDEBAR_WIDTH_MAX}
                step={10}
                value={values.sidebarWidth[side]}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    sidebarWidth: { ...v.sidebarWidth, [side]: Number(event.target.value) },
                  }))
                }
                className="mt-2 w-full"
                style={{ accentColor: "var(--primary)" }}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-6">
          <SidebarLayoutEditor
            title="文章页"
            layout={values.sidebar.post}
            onChange={(next) =>
              setValues((v) => ({ ...v, sidebar: { ...v.sidebar, post: next } }))
            }
          />
          <SidebarLayoutEditor
            title="列表 / 标签 / 归档页"
            layout={values.sidebar.list}
            onChange={(next) =>
              setValues((v) => ({ ...v, sidebar: { ...v.sidebar, list: next } }))
            }
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* 吸底保存 */}
      <div className="glass sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        {message ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            {message}
          </Badge>
        ) : saving ? (
          <span className="text-xs text-muted-foreground">保存中…</span>
        ) : dirty ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            有未保存的改动
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            已同步
          </span>
        )}
        <Button className="ml-auto" size="sm" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
