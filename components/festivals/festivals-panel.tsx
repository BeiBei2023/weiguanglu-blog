"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Eye, Pencil, RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DEFAULT_FESTIVALS,
  FESTIVAL_EFFECTS,
  FESTIVAL_KINDS,
  type FestivalEffect,
  type FestivalEntry,
  type FestivalKind,
} from "@/lib/festival-defaults";
import type { ActiveFestival, UpcomingFestival } from "@/lib/festival";
import {
  deleteFestivalAction,
  resetFestivalsAction,
  saveFestivalAction,
  setPreviewAction,
  syncHolidaysAction,
  toggleFestivalAction,
} from "@/app/w/festivals/actions";

type DateMode = "span" | "solar" | "lunar";

const KIND_LABEL = new Map(FESTIVAL_KINDS.map((item) => [item.id, item.label]));
const EFFECT_OPTIONS = FESTIVAL_EFFECTS;

function ruleLabel(entry: FestivalEntry): string {
  if (entry.start && entry.end) return `${entry.start} → ${entry.end}`;
  const rule = entry.rule;
  if (!rule) return "未设置日期";
  const prefix = rule.type === "lunar" ? "农历" : "公历";
  return `${prefix} ${rule.month} 月 ${rule.day} 日（自动对年）`;
}

function emptyEntry(): FestivalEntry {
  return {
    id: "",
    name: "",
    greeting: "节日快乐",
    emoji: "🎉",
    color: "#e07a52",
    effect: "confetti",
    kind: "minor",
    enabled: true,
    days: 1,
    rule: { type: "solar", month: 1, day: 1 },
    source: "manual",
  };
}

function cloneEntry(entry: FestivalEntry): FestivalEntry {
  return {
    ...entry,
    rule: entry.rule ? { ...entry.rule } : undefined,
  };
}

export function FestivalsPanel({
  entries,
  active,
  upcoming,
  mode,
  syncedYear,
}: {
  entries: FestivalEntry[];
  active: ActiveFestival[];
  upcoming: UpcomingFestival | null;
  mode: string;
  syncedYear: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<FestivalEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const activeById = new Map(active.map((item) => [item.id, item]));
  const previewId = mode !== "auto" && mode !== "off" ? mode : null;

  function patch(patchValue: Partial<FestivalEntry>) {
    setDraft((current) => (current ? { ...current, ...patchValue } : current));
  }

  async function run(key: string, task: () => Promise<{ ok: boolean; error?: string; notice?: string }>) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await task();
      if (!result.ok) {
        setMessage(result.error ?? "操作失败");
        toast.error(result.error ?? "操作失败");
        return;
      }
      setMessage(result.notice ?? "完成");
      toast.success(result.notice ?? "完成");
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  const modeLabel = mode === "auto" ? "自动（按日期识别）" : mode === "off" ? "关闭" : `固定展示：${entries.find((item) => item.id === mode)?.name ?? mode}`;

  const dateMode: DateMode = draft?.start && draft?.end ? "span" : draft?.rule?.type === "lunar" ? "lunar" : "solar";

  function setDateMode(next: DateMode) {
    if (!draft) return;
    if (next === "span") {
      const today = new Date().toISOString().slice(0, 10);
      patch({ start: draft.start ?? today, end: draft.end ?? today, rule: undefined });
      return;
    }
    patch({ start: undefined, end: undefined, rule: { type: next, month: draft.rule?.month ?? 1, day: draft.rule?.day ?? 1 } });
  }

  function submitDraft() {
    if (!draft) return;
    const id = draft.id.trim();
    if (!/^[a-z0-9-]{1,60}$/.test(id)) {
      toast.error("id 只能用小写字母、数字和连字符");
      return;
    }
    if (!draft.name.trim()) {
      toast.error("请填节日名称");
      return;
    }
    if (dateMode === "span" && (!draft.start || !draft.end)) {
      toast.error("请填起止日期");
      return;
    }
    const days = dateMode === "span" && draft.start && draft.end
      ? Math.max(1, Math.round((Date.parse(draft.end) - Date.parse(draft.start)) / 86400000) + 1)
      : Math.max(1, Math.min(60, Math.floor(draft.days ?? 1)));
    const payload: FestivalEntry = {
      ...draft,
      id,
      name: draft.name.trim(),
      days,
      ...(dateMode === "span" ? {} : { start: undefined, end: undefined }),
    };
    void run(isNew || !entries.some((item) => item.id === id) ? `save:${id}` : `save:${id}`, async () => {
      const result = await saveFestivalAction(payload);
      if (result.ok) {
        setDraft(null);
        setIsNew(false);
      }
      return result;
    });
  }

  return (
    <div className="space-y-4">
      {/* 状态与同步 */}
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">当前模式</h2>
            <p className="mt-1 text-xs text-muted-foreground">{modeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {previewId ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || pending}
                onClick={() => void run("preview", () => setPreviewAction(null))}
              >
                <X className="size-3.5" />
                取消预览（恢复自动）
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || pending}
              onClick={() => void run("sync", () => syncHolidaysAction(new Date().getFullYear()))}
            >
              <RefreshCw className={cn("size-3.5", busy === "sync" && "animate-spin")} />
              同步今年放假安排
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || pending}
              onClick={() => void run("sync-next", () => syncHolidaysAction(new Date().getFullYear() + 1))}
            >
              同步明年
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || pending}
              onClick={() => void run("reset", () => resetFestivalsAction())}
            >
              <RotateCcw className="size-3.5" />
              恢复默认
            </Button>
            <Button
              size="sm"
              disabled={busy !== null || pending}
              onClick={() => {
                setDraft(emptyEntry());
                setIsNew(true);
                setMessage(null);
              }}
            >
              <CalendarPlus className="size-3.5" />
              新增节日
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>共 {entries.length} 条</span>
          {syncedYear ? <span>放假数据：{syncedYear} 年</span> : <span>放假数据：还没同步过</span>}
          {upcoming ? (
            <span>
              下一个：{upcoming.entry.emoji} {upcoming.entry.name} · {upcoming.start.slice(5)}
              {upcoming.inDays === 0 ? "（就是今天）" : `（${upcoming.inDays} 天后）`}
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          {active.length === 0 ? (
            <p className="text-xs text-muted-foreground">今天没有节日。</p>
          ) : (
            active.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/60 bg-accent/10 p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span>{item.emoji}</span>
                  <span className="font-medium">{item.name}</span>
                  <span style={{ color: item.color }}>
                    第 {item.day}/{item.total} 天
                  </span>
                  <span className="text-muted-foreground">
                    {item.start} → {item.end}
                  </span>
                  {item.preview ? <span className="rounded-full bg-primary/15 px-2 text-primary">预览</span> : null}
                </div>
                <div className="mt-2 h-1 w-full rounded-full" style={{ background: `color-mix(in oklab, ${item.color} 25%, transparent)` }}>
                  <div className="h-1 rounded-full" style={{ width: `${Math.round(item.progress * 100)}%`, background: item.color }} />
                </div>
              </div>
            ))
          )}
        </div>

        {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
      </section>

      {/* 编辑表单 */}
      {draft ? (
        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{isNew ? "新增节日" : `编辑：${draft.name || draft.id}`}</h2>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              <X className="size-3.5" />
              取消
            </Button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 wgl-cells">
            <label className="text-xs">
              <span className="text-muted-foreground">id（小写字母/数字/连字符，用来固定展示）</span>
              <Input
                className="mt-1"
                value={draft.id}
                disabled={!isNew}
                onChange={(event) => patch({ id: event.target.value })}
                placeholder="如 mid-autumn"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">名称</span>
              <Input className="mt-1" value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="中秋节" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">祝福语（横幅与徽标上显示）</span>
              <Input className="mt-1" value={draft.greeting} onChange={(event) => patch({ greeting: event.target.value })} placeholder="中秋快乐" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">emoji</span>
              <Input className="mt-1" value={draft.emoji} onChange={(event) => patch({ emoji: event.target.value })} placeholder="🌕" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">主题色</span>
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => patch({ color: event.target.value })}
                  className="h-8 w-12 rounded-lg border border-border bg-transparent"
                />
                <Input value={draft.color} onChange={(event) => patch({ color: event.target.value })} />
              </span>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">动效</span>
              <select
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={draft.effect}
                onChange={(event) => patch({ effect: event.target.value as FestivalEffect })}
              >
                {EFFECT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">类型</span>
              <select
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={draft.kind}
                onChange={(event) => patch({ kind: event.target.value as FestivalKind })}
              >
                {FESTIVAL_KINDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5 text-xs">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
              <span>启用（停用后当天不触发）</span>
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">日期规则</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([
                { id: "span", label: "固定区间" },
                { id: "solar", label: "公历（月-日）" },
                { id: "lunar", label: "农历（月-日）" },
              ] as { id: DateMode; label: string }[]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    dateMode === item.id
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setDateMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {dateMode === "span" ? (
              <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
                <label>
                  <span className="text-muted-foreground">开始</span>
                  <Input type="date" className="mt-1" value={draft.start ?? ""} onChange={(event) => patch({ start: event.target.value })} />
                </label>
                <label>
                  <span className="text-muted-foreground">结束</span>
                  <Input type="date" className="mt-1" value={draft.end ?? ""} onChange={(event) => patch({ end: event.target.value })} />
                </label>
                <p className="text-muted-foreground">固定区间一般由「同步放假安排」自动写入；手动填也可以。</p>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
                <label>
                  <span className="text-muted-foreground">月</span>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    className="mt-1 w-24"
                    value={draft.rule?.month ?? 1}
                    onChange={(event) => patch({ rule: { type: dateMode, month: Math.max(1, Math.min(12, Number(event.target.value) || 1)), day: draft.rule?.day ?? 1 } })}
                  />
                </label>
                <label>
                  <span className="text-muted-foreground">日</span>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    className="mt-1 w-24"
                    value={draft.rule?.day ?? 1}
                    onChange={(event) => patch({ rule: { type: dateMode, month: draft.rule?.month ?? 1, day: Math.max(1, Math.min(31, Number(event.target.value) || 1)) } })}
                  />
                </label>
                <p className="text-muted-foreground">
                  {dateMode === "lunar" ? "农历会自动换算成公历（如生日农历七月廿七）。" : "公历每年同一月日。"}
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
              <label>
                <span className="text-muted-foreground">展示天数（没有固定区间时用）</span>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  className="mt-1 w-28"
                  value={draft.days ?? 1}
                  onChange={(event) => patch({ days: Math.max(1, Math.min(60, Number(event.target.value) || 1)) })}
                />
              </label>
              <label className="min-w-[240px] flex-1">
                <span className="text-muted-foreground">备注</span>
                <Input className="mt-1" value={draft.note ?? ""} onChange={(event) => patch({ note: event.target.value })} placeholder="可选" />
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" disabled={busy !== null || pending} onClick={submitDraft}>
              <Save className="size-3.5" />
              保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
              取消
            </Button>
          </div>
        </section>
      ) : null}

      {/* 列表 */}
      <section className="glass rounded-2xl p-5">
        <h2 className="text-sm font-medium">全部节日（{entries.length}）</h2>
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => {
            const today = activeById.get(entry.id);
            return (
              <li key={entry.id} className="rounded-2xl border border-border/60 bg-accent/10 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-lg">{entry.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: entry.color }}>
                    {entry.name}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {KIND_LABEL.get(entry.kind) ?? entry.kind}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      entry.source === "holiday-cn" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-accent text-muted-foreground",
                    )}
                  >
                    {entry.source === "holiday-cn" ? "国务院数据" : "自定义"}
                  </span>
                  {today ? (
                    <span className="text-[11px]" style={{ color: entry.color }}>
                      第 {today.day}/{today.total} 天
                    </span>
                  ) : null}
                  {previewId === entry.id ? <span className="rounded-full bg-primary/15 px-2 text-[11px] text-primary">预览中</span> : null}
                  {!entry.enabled ? <span className="text-[11px] text-muted-foreground">已停用</span> : null}
                  <span className="text-[11px] tabular-nums text-muted-foreground">{ruleLabel(entry)}</span>

                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || pending}
                      onClick={() =>
                        void run(`toggle:${entry.id}`, () => toggleFestivalAction(entry.id, !entry.enabled))
                      }
                    >
                      {entry.enabled ? "停用" : "启用"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || pending}
                      onClick={() => void run(`preview:${entry.id}`, () => setPreviewAction(previewId === entry.id ? null : entry.id))}
                    >
                      <Eye className="size-3.5" />
                      {previewId === entry.id ? "取消预览" : "预览"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDraft(cloneEntry(entry));
                        setIsNew(false);
                        setMessage(null);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null || pending}
                      onClick={() =>
                        void confirm({
                          title: `删除「${entry.name}」？`,
                          description: "删掉后可以用「恢复默认」找回内置节日（手工新增的会丢）。",
                          confirmLabel: "删除",
                          destructive: true,
                        }).then((ok) => {
                          if (ok) void run(`del:${entry.id}`, () => deleteFestivalAction(entry.id));
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </div>
                {entry.note ? <p className="mt-1 text-[11px] text-muted-foreground">{entry.note}</p> : null}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          内置节日共 {DEFAULT_FESTIVALS.length} 条；「固定区间」型（法定节假日）由「同步放假安排」写入国务院公布的起止日期，调休变化时会一起更新。
        </p>
      </section>

      {confirmDialog}
    </div>
  );
}
