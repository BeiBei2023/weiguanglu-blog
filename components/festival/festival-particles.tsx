"use client";

/**
 * 节日粒子特效（客户端）。
 *
 * - 懒加载 tsParticles（react 包 + slim 引擎 + emoji 形状），不进首屏 bundle
 * - 系统开了「减少动态效果」时不渲染
 * - 只在节日区间内挂载（由 app/layout.tsx 控制）
 */
import { useEffect, useState } from "react";
import type { Engine, ISourceOptions } from "@tsparticles/engine";
import { buildFestivalParticles } from "@/lib/festival-effects";
import type { FestivalEffect } from "@/lib/festival-defaults";

type ReactMod = typeof import("@tsparticles/react");
interface Loaded {
  mod: ReactMod;
  /** init 回调必须在整个生命周期内保持同一个引用（Provider 的要求） */
  init: (engine: Engine) => Promise<void>;
}

let loaded: Promise<Loaded> | null = null;

function loadParticles(): Promise<Loaded> {
  if (!loaded) {
    loaded = (async () => {
      const [react, slim, emoji] = await Promise.all([
        import("@tsparticles/react"),
        import("@tsparticles/slim"),
        import("@tsparticles/shape-emoji"),
      ]);
      const init = async (engine: Engine) => {
        await slim.loadSlim(engine);
        await emoji.loadEmojiShape(engine);
      };
      return { mod: react, init };
    })();
  }
  return loaded;
}

export function FestivalParticles({
  effect,
  emoji,
  color,
  className,
}: {
  effect: FestivalEffect;
  emoji: string;
  color: string;
  className?: string;
}) {
  const [runtime, setRuntime] = useState<Loaded | null>(null);

  useEffect(() => {
    if (effect === "none") return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    void loadParticles().then((value) => {
      if (!cancelled) setRuntime(value);
    });
    return () => {
      cancelled = true;
    };
  }, [effect]);

  if (effect === "none" || !runtime) return null;

  const options: ISourceOptions = buildFestivalParticles({ effect, emoji, color });
  const { Particles, ParticlesProvider } = runtime.mod;

  return (
    <div
      aria-hidden
      className={className ?? "pointer-events-none fixed inset-0 -z-10 h-full w-full"}
    >
      <ParticlesProvider init={runtime.init}>
        <Particles id="wgl-festival-particles" options={options} />
      </ParticlesProvider>
    </div>
  );
}
