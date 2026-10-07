"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, History, Loader2, Printer, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import type { AiReport, AiReportSummary } from "@/lib/ai";

export interface AiPanelConfig {
  configured: boolean;
  endpoint: string;
  model: string;
  points: number;
  models: { id: string; label: string }[];
}

/**
 * /w/hot 的 AI 解读面板。
 * key 由用户自己填（存服务器 data/ai.json）；**只有点下面的按钮才会调用**。
 */
export function HotAiPanel({
  initialConfig,
  initialReports,
  items,
}: {
  initialConfig: AiPanelConfig;
  initialReports: AiReportSummary[];
  items: { title: string; url: string; meta?: string; source?: string }[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [reports, setReports] = useState(initialReports);
  const [report, setReport] = useState<AiReport | null>(null);
  const [showSettings, setShowSettings] = useState(!initialConfig.configured);
  const [showHistory, setShowHistory] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [endpoint, setEndpoint] = useState(initialConfig.endpoint);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  /** 保存后立刻真发一次请求，确认 key / 接口地址 / 模型这三样都对 */
  const saveAndTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await saveConfig();
      const response = await fetch("/api/w/ai/test", { method: "POST", cache: "no-store" });
      const data = (await response.json()) as { ok?: boolean; reply?: string; error?: string };
      if (data.ok) {
        setTestOk(true);
        setTestResult(`连接正常，模型回复：${data.reply ?? "OK"}`);
      } else {
        setTestOk(false);
        setTestResult(data.error ?? `测试失败（HTTP ${response.status}）`);
      }
    } catch {
      setTestOk(false);
      setTestResult("测试请求没发出去，检查网络或服务是否在跑");
    } finally {
      setTesting(false);
    }
  };
  const [model, setModel] = useState(initialConfig.model);
  const [points, setPoints] = useState(initialConfig.points);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveConfig() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/w/ai/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(keyDraft.trim() ? { apiKey: keyDraft } : {}), endpoint, model, points }),
      });
      const data = (await response.json()) as {
        error?: string;
        configured?: boolean;
        endpoint?: string;
        model?: string;
        points?: number;
      };
      if (!response.ok) throw new Error(data.error ?? `保存失败（HTTP ${response.status}）`);
      setConfig((current) => ({
        ...current,
        configured: Boolean(data.configured),
        endpoint: data.endpoint ?? current.endpoint,
        model: data.model ?? current.model,
        points: data.points ?? current.points,
      }));
      setKeyDraft("");
      toast.success("已保存");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "保存失败";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!config.configured) {
      setShowSettings(true);
      setError("先填一下 OpenCode Zen 的 API key");
      return;
    }
    if (items.length === 0) {
      setError("现在还没有 GitHub 新星的条目，先点右上「立即刷新」");
      return;
    }

    type ItemPoint = { title: string; url: string; source: string; detail: string };

    const batchSize = Math.min(20, Math.max(10, Number(points) || 15));
    const batches: (typeof items)[] = [];
    for (let index = 0; index < items.length; index += batchSize) {
      batches.push(items.slice(index, index + batchSize));
    }

    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: batches.length });
    stopRef.current = false;

    const sections: { label: string; points: ItemPoint[] }[] = [];
    let model = "";
    let failed = 0;

    try {
      for (let index = 0; index < batches.length; index += 1) {
        if (stopRef.current) break;
        const batch = batches[index];
        const labels = Array.from(
          new Set(batch.map((entry) => entry.source).filter((value): value is string => Boolean(value))),
        );
        try {
          const response = await fetch("/api/w/ai/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              task: "hot-batch",
              label: labels.join(" / ") || "热点",
              items: batch.map((entry) => ({
                title: entry.title,
                url: entry.url,
                meta: entry.meta ?? "",
                source: entry.source ?? "",
              })),
            }),
          });
          const data = (await response.json()) as {
            error?: string;
            points?: ItemPoint[];
            model?: string;
          };
          if (!response.ok || !data.points) {
            throw new Error(data.error ?? `第 ${index + 1} 批失败`);
          }
          sections.push({ label: labels.join(" / ") || "热点", points: data.points });
          if (data.model) model = data.model;
        } catch {
          failed += 1;
        }
        setProgress({ done: index + 1, total: batches.length });
      }

      if (sections.length === 0) {
        throw new Error("所有批次都没成功，稍后再试（也可以换个模型）");
      }

      const saveResponse = await fetch("/api/w/ai/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "hot-save", sections, model }),
      });
      const saveData = (await saveResponse.json()) as { error?: string; report?: AiReport };
      if (!saveResponse.ok || !saveData.report) {
        throw new Error(saveData.error ?? `保存失败（HTTP ${saveResponse.status}）`);
      }
      setReport(saveData.report);
      setReports((current) => [
        {
          id: saveData.report!.id,
          at: saveData.report!.at,
          model: saveData.report!.model,
          headline: saveData.report!.headline,
          count: saveData.report!.points.length,
        },
        ...current,
      ]);
      toast.success(
        failed > 0
          ? `分析完成：${saveData.report.points.length} 条（有 ${failed} 批失败，可再点一次补齐）`
          : `全部分析完成：${saveData.report.points.length} 条`,
      );
    } catch (generateError) {
      const message = generateError instanceof Error ? generateError.message : "生成失败";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setProgress(null);
      stopRef.current = false;
    }
  }

  async function openReport(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/ai/reports/${id}`);
      const data = (await response.json()) as { error?: string; report?: AiReport };
      if (!response.ok || !data.report) {
        throw new Error(data.error ?? "读不到这条解读");
      }
      setReport(data.report);
      setShowHistory(false);
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : "读不到这条解读";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Sparkles className="size-4 text-primary" />
          AI 解读 · 仅 GitHub 新星
        </h2>
        <span className="text-xs text-muted-foreground">
          只把「GitHub 新星」的标题交给 AI 逐条解说（免费模型 · 只在点按钮时才跑）
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void generate()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy && progress ? `分析中… ${progress.done}/${progress.total} 批` : "生成全部分析"}
          </Button>
          {busy ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              停止
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setShowSettings((value) => !value)}>
            <Settings2 className="size-4" />
            AI 设置
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHistory((value) => !value)}
            disabled={!reports.length}
          >
            <History className="size-4" />
            历史解读{reports.length ? `（${reports.length}）` : ""}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "展开 AI 解读区块" : "收起 AI 解读区块"}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            {collapsed ? "展开" : "收起"}
          </Button>
        </div>
      </div>

      <div className={collapsed ? "hidden" : undefined}>
        {showSettings ? (
        <div className="mt-3 rounded-2xl border border-border/60 bg-background/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2 wgl-cells">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium">OpenCode API key</span>
              <Input
                type="password"
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder={config.configured ? "已填写（留空表示不改）" : "从 opencode.ai/auth 复制"}
                className="h-8 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium">接口地址</span>
              <Input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://opencode.ai/zen/go/v1"
                className="h-8 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">
                Go 订阅用 /zen/go/v1（默认）；Zen 余额用 /zen/v1
              </span>
            </label>
            <div className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="font-medium">模型（点下面任意一个选中，也可以自己填 id）</span>
              <div className="flex flex-wrap gap-1.5">
                {config.models.map((item) => {
                  const active = item.id === model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      onClick={() => setModel(item.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        active
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {item.id}
                    </button>
                  );
                })}
              </div>
              <Input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="deepseek-v4.1-flash"
                className="mt-1 h-8 font-mono text-xs"
              />
              {config.models.some((item) => item.id === model) ? null : (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  当前填的 <span className="font-medium">{model || "（空）"}</span> 不在 Go 档列表里，用 Go
                  端点可能报「模型不存在」；点上面选一个，或确认你走的是 Zen 余额端点。
                </span>
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium">每批条数（10–20）</span>
              <Input
                type="number"
                min={10}
                max={20}
                value={points}
                onChange={(event) => setPoints(Number(event.target.value))}
                className="h-8 text-xs"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void saveConfig()} disabled={saving || testing}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存设置
            </Button>
            <Button size="sm" onClick={() => void saveAndTest()} disabled={saving || testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : null}
              保存并测试连接
            </Button>
            {testResult ? (
              <span
                className={`text-[11px] ${
                  testOk ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {testResult}
              </span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              key 只存在你自己服务器上（<span className="font-medium">data/ai.json</span>，不进 git）；默认走你的 Go 订阅额度，标注「免费」的两个模型不限量。
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {showHistory ? (
        <ul className="mt-3 space-y-1">
          {reports.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void openReport(item.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-muted/60"
              >
                <span className="tabular-nums text-muted-foreground">{item.at}</span>
                <span className="min-w-0 flex-1 truncate">{item.headline}</span>
                <span className="tabular-nums text-muted-foreground">{item.count} 条</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {report ? (
        <article className="mt-4 border-t border-border/60 pt-4">
          <header className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-heading text-lg font-bold">{report.headline}</h3>
            <span className="text-xs text-muted-foreground">
              {report.at} · {report.model} · {report.points.length} 条
            </span>
            <span className="ml-auto flex items-center gap-2">
              <a
                href={`/api/w/ai/reports/${report.id}?format=md`}
                className="inline-flex items-center gap-1 rounded-xl border border-border px-2 py-1 text-xs hover:bg-muted/60"
              >
                <Download className="size-3.5" />
                下载 MD
              </a>
              <a
                href={`/w/hot/reports/${report.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-border px-2 py-1 text-xs hover:bg-muted/60"
              >
                <Printer className="size-3.5" />
                打印 / 存 PDF
              </a>
            </span>
          </header>
          {report.overview ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{report.overview}</p>
          ) : null}
          <ol className="mt-3 space-y-3">
            {report.points.map((point, index) => (
              <li key={`${point.title}-${index}`} className="rounded-2xl border border-border/60 bg-background/40 p-3">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary",
                    )}
                  >
                    {index + 1}
                  </span>
                  {point.url ? (
                    <a
                      href={point.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline-offset-2 hover:text-primary hover:underline"
                    >
                      {point.title}
                    </a>
                  ) : (
                    <span className="font-medium">{point.title}</span>
                  )}
                  {point.source ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{point.source}</span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{point.detail}</p>
              </li>
            ))}
          </ol>
        </article>
      ) : null}
      </div>
    </section>
  );
}
