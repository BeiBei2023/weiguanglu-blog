"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { WidgetHeading } from "./widget-heading";

interface Quote {
  text: string;
  from: string;
}

const FALLBACK: Quote = { text: "靡不有初，鲜克有终。", from: "《诗经》" };

/** 纯取数（不含 setState）：5 秒超时，失败返回 null */
async function fetchQuote(signal?: AbortSignal): Promise<Quote | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch("https://v1.hitokoto.cn/", { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { hitokoto?: string; from?: string; from_who?: string };
    if (!data.hitokoto) return null;
    return { text: data.hitokoto, from: data.from_who || data.from || "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function HitokotoWidget() {
  const [quote, setQuote] = useState<Quote>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((next: Quote | null) => {
    if (next) setQuote(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetchQuote(controller.signal)
      .then((next) => {
        if (!cancelled) apply(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apply]);

  function refresh() {
    setLoading(true);
    fetchQuote()
      .then(apply)
      .finally(() => setLoading(false));
  }

  return (
    <section aria-label="一言">
      <div className="mb-3 flex items-center justify-between gap-2">
        <WidgetHeading>一言</WidgetHeading>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="换一句"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <blockquote className="border-l-2 border-primary/50 pl-3 text-sm leading-relaxed">
        {quote.text}
        {quote.from ? (
          <footer className="mt-1 text-xs text-muted-foreground">—— {quote.from}</footer>
        ) : null}
      </blockquote>
    </section>
  );
}
