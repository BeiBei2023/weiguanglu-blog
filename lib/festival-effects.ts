/**
 * 节日粒子特效：把「节日条目」翻译成 tsParticles 的配置对象。
 *
 * 客户端安全（只 import 类型，不带 node 模块）；真正的渲染在
 * components/festival/festival-particles.tsx（懒加载 @tsparticles/react + slim + shape-emoji）。
 */
import type { ISourceOptions } from "@tsparticles/engine";
import type { FestivalEffect } from "./festival-defaults";

/**
 * 画 emoji 用的字体栈：让访客浏览器找系统自带的彩色 emoji 字体
 * （tsParticles 默认写的是 Twemoji，桌面端不一定装了，会退化成黑白轮廓）。
 */
const EMOJI_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

export interface EffectInput {
  effect: FestivalEffect;
  emoji: string;
  color: string;
}

/** 骨架：占满父容器（父容器自己 fixed inset-0），不抢鼠标、不响应点击 */
function base(count: number): ISourceOptions {
  return {
    fullScreen: { enable: false },
    detectRetina: true,
    fpsLimit: 60,
    particles: {
      number: { value: count },
      links: { enable: false },
      collisions: { enable: false },
      move: {
        enable: true,
        speed: 1,
        direction: "bottom",
        straight: false,
        outModes: { default: "out" },
      },
      opacity: { value: { min: 0.6, max: 1 } },
      size: { value: { min: 4, max: 10 } },
      rotate: { value: { min: 0, max: 360 }, animation: { enable: false } },
      shape: { type: "circle" },
    },
    interactivity: {
      events: {
        onHover: { enable: false },
        onClick: { enable: false },
        resize: { enable: true },
      },
    },
  };
}

/** emoji 形状（可传一个或多个 emoji，粒子随机取用） */
function emojiShape(value: string | string[], maxSize: number) {
  return {
    type: "emoji",
    options: {
      emoji: { value: value || "✨", font: EMOJI_FONT, particleSize: maxSize, padding: 4 },
    },
  };
}

/** 按节日效果生成 tsParticles options */
export function buildFestivalParticles({ effect, emoji, color }: EffectInput): ISourceOptions {
  switch (effect) {
    // 飘落 emoji（春节的雪花、端午的龙舟、生日的蛋糕…）
    case "emoji-fall":
      return {
        ...base(20),
        particles: {
          ...base(20).particles,
          shape: emojiShape(emoji, 30),
          size: { value: { min: 16, max: 30 } },
          opacity: { value: { min: 0.8, max: 1 } },
          move: {
            enable: true,
            direction: "bottom",
            speed: { min: 0.6, max: 1.6 },
            straight: false,
            outModes: { default: "out" },
          },
          wobble: { enable: true, distance: 16, speed: { min: -5, max: 5 } },
          rotate: {
            value: { min: 0, max: 360 },
            animation: { enable: true, speed: 10 },
            direction: "random",
          },
        },
      } as ISourceOptions;

    // 雪花：白色小圆点慢慢落
    case "snow":
      return {
        ...base(70),
        particles: {
          ...base(70).particles,
          color: { value: ["#ffffff", "#e6eef8", "#cfe0f2"] },
          size: { value: { min: 2, max: 6 } },
          opacity: { value: { min: 0.5, max: 0.95 } },
          move: {
            enable: true,
            direction: "bottom",
            speed: { min: 0.4, max: 1.3 },
            straight: false,
            outModes: { default: "out" },
          },
          wobble: { enable: true, distance: 12, speed: { min: -3, max: 3 } },
        },
      } as ISourceOptions;

    // 彩纸屑：飘落的 🎉🎊✨（原来用方块，看着像马赛克）
    case "confetti":
      return {
        ...base(34),
        particles: {
          ...base(34).particles,
          shape: emojiShape(["🎉", "🎊", "✨"], 22),
          size: { value: { min: 12, max: 22 } },
          opacity: { value: { min: 0.85, max: 1 } },
          move: {
            enable: true,
            direction: "bottom",
            speed: { min: 1.6, max: 3.6 },
            straight: false,
            outModes: { default: "out" },
          },
          wobble: { enable: true, distance: 20, speed: { min: -6, max: 6 } },
          rotate: {
            value: { min: 0, max: 360 },
            animation: { enable: true, speed: 12 },
            direction: "random",
          },
        },
      } as ISourceOptions;

    // 灯笼/月亮：向上飘的暖色光团（元宵、中秋）
    case "lantern":
      return {
        ...base(26),
        particles: {
          ...base(26).particles,
          shape: emojiShape(emoji, 34),
          size: { value: { min: 18, max: 34 } },
          opacity: {
            value: { min: 0.6, max: 1 },
            animation: { enable: true, speed: 0.8, sync: false, startValue: "random" },
          },
          move: {
            enable: true,
            direction: "top",
            speed: { min: 0.4, max: 1.1 },
            straight: false,
            outModes: { default: "out" },
          },
          wobble: { enable: true, distance: 20, speed: { min: -4, max: 4 } },
        },
      } as ISourceOptions;

    // 花瓣：飘落 + 旋转（清明、七夕、教师节、重阳）
    case "petal":
      return {
        ...base(48),
        particles: {
          ...base(48).particles,
          shape: emojiShape(emoji, 24),
          size: { value: { min: 12, max: 24 } },
          opacity: { value: { min: 0.7, max: 1 } },
          move: {
            enable: true,
            direction: "bottom",
            speed: { min: 0.8, max: 2 },
            straight: false,
            outModes: { default: "out" },
          },
          wobble: { enable: true, distance: 24, speed: { min: -6, max: 6 } },
          rotate: {
            value: { min: 0, max: 360 },
            animation: { enable: true, speed: 14 },
            direction: "random",
          },
        },
      } as ISourceOptions;

    // 星光：向上飘的小星星，边升边闪（元旦、国庆、程序员节、建站周年）
    case "spark":
      return {
        ...base(54),
        particles: {
          ...base(54).particles,
          color: { value: [color, "#ffd66b", "#fff3d6"] },
          shape: { type: "star" },
          size: { value: { min: 3, max: 9 } },
          opacity: {
            value: { min: 0.15, max: 1 },
            animation: { enable: true, speed: 2.2, sync: false, startValue: "random" },
          },
          move: {
            enable: true,
            direction: "top",
            speed: { min: 0.8, max: 2.6 },
            straight: false,
            outModes: { default: "out" },
          },
          wobble: { enable: true, distance: 14, speed: { min: -4, max: 4 } },
          rotate: {
            value: { min: 0, max: 360 },
            animation: { enable: true, speed: 6 },
            direction: "random",
          },
        },
      } as ISourceOptions;

    // 关闭
    case "none":
    default:
      return {
        fullScreen: { enable: false },
        particles: { number: { value: 0 } },
      } as ISourceOptions;
  }
}
