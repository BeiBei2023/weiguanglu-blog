"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackagePlus,
  ScanSearch,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { quickInboundAction } from "@/app/w/inventory/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import type { StockInBoxOption } from "@/lib/inventory/domain";
import type { LookupQueue, LookupQueueEntry } from "@/lib/inventory/lookup-queue";

async function postQueue(
  action: "create" | "step" | "clear",
  queries?: string[],
): Promise<LookupQueue | null> {
  const response = await fetch("/api/w/inventory/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, queries }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { queue?: LookupQueue; error?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败（HTTP ${response.status}）`);
  }
  return payload?.queue ?? null;
}

const STATUS_META: Record<
  LookupQueueEntry["status"],
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: "text-emerald-500", label: "已识别" },
  notfound: { icon: AlertTriangle, className: "text-amber-500", label: "未找到" },
  error: { icon: XCircle, className: "text-red-500", label: "失败" },
  pending: { icon: Loader2, className: "animate-spin text-muted-foreground", label: "待识别" },
};

/**
 * 「批量识别」：一次丢一批型号/编号进队列，客户端轮询逐步抓取（服务端有节流与退避），
 * 结果可一键全部入库。适合一次整理几十上百个料号。
 */
export function BatchIdentifyDialog({ boxes }: { boxes: StockInBoxOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [queue, setQueue] = useState<LookupQueue | null>(null);
  const [running, setRunning] = useState(false);
  const [boxId, setBoxId] = useState(boxes[0] ? String(boxes[0].id) : "");
  const [inbounding, startInbound] = useTransition();

  const entries = useMemo(() => queue?.entries ?? [], [queue]);
  const stats = useMemo(() => {
    const count = (status: LookupQueueEntry["status"]) =>
      entries.filter((entry) => entry.status === status).length;
    return {
      total: entries.length,
      ok: count("ok"),
      notfound: count("notfound"),
      error: count("error"),
      pending: count("pending"),
      done: entries.length - count("pending"),
      cooldown:
        entries.find((entry) => entry.status === "pending" && entry.message)?.message ?? "",
    };
  }, [entries]);

  // 轮询驱动：完成一条再发下一条
  useEffect(() => {
    if (!open || !running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await postQueue("step");
        if (cancelled || !next) return;
        setQueue(next);
        const pending = next.entries.filter((entry) => entry.status === "pending");
        if (!pending.length) {
          setRunning(false);
          toast.success("批量识别完成");
          return;
        }
        // 被限流时放慢重试
        const cooling = pending.some((entry) => entry.message);
        timer = setTimeout(tick, cooling ? 5000 : 700);
      } catch (error) {
        if (cancelled) return;
        setRunning(false);
        toast.error(error instanceof Error ? error.message : "批量识别中断");
      }
    };
    timer = setTimeout(tick, 300);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, running]);

  async function start() {
    const queries = text
      .split(/[\n,，;；\t]+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!queries.length) {
      toast.error("请先粘贴要识别的型号或编号（一行一个）");
      return;
    }
    try {
      const next = await postQueue("create", queries);
      setQueue(next);
      setRunning(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建队列失败");
    }
  }

  async function stop() {
    setRunning(false);
    try {
      const next = await postQueue("clear");
      setQueue(next);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清空失败");
    }
  }

  function inboundAll() {
    const rows = entries.flatMap((entry) => {
      const item = entry.status === "ok" ? entry.item : undefined;
      if (!item) return [];
      return [
        {
          partNo: item.form.partNo,
          name: item.form.name,
          quantity: 1,
          specification: item.form.specification,
          note: item.form.note,
        },
      ];
    });
    if (!rows.length) {
      toast.error("没有可入库的识别结果");
      return;
    }
    if (!boxId) {
      toast.error("请先选择容器");
      return;
    }
    startInbound(async () => {
      const res = await quickInboundAction({ boxId: Number(boxId), rows });
      if (res.ok) {
        toast.success(`已入库 ${res.details.length} 条（并入已有位置 ${res.merged} 条）`);
        setOpen(false);
        setQueue(null);
        setText("");
        router.refresh();
      } else {
        toast.error(res.failed[0]?.message ?? res.error ?? "入库失败");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setRunning(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!boxes.length}>
          <ScanSearch className="size-4" />
          批量识别
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>批量识别</DialogTitle>
          <DialogDescription>
            一行一个（型号 / 立创编号 / 商品链接）。识别会排队逐步抓取，带节流与退避；命中的结果可一键全部入库。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="batch-identify-input" className="text-xs text-muted-foreground">
              待识别清单
            </Label>
            <Textarea
              id="batch-identify-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              disabled={running}
              placeholder={"ESP32-C3-MINI-1\nC42411897\nitem.szlcsc.com/44398166.html"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void start()} disabled={running}>
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanSearch className="size-4" />
              )}
              {running ? "识别中…" : "开始识别"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void stop()}
              disabled={!running && !entries.length}
            >
              停止并清空
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              共 {stats.total} · 已识别 {stats.ok} · 未找到 {stats.notfound} · 失败 {stats.error} · 待识别{" "}
              {stats.pending}
            </span>
          </div>

          {stats.total > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((stats.done / stats.total) * 100)}%` }}
              />
            </div>
          )}

          {stats.cooldown && <p className="text-xs text-amber-500">{stats.cooldown}</p>}

          {entries.length > 0 && (
            <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
              {entries.map((entry) => {
                const meta = STATUS_META[entry.status];
                const Icon = meta.icon;
                return (
                  <div
                    key={entry.query}
                    className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/60 px-2.5 py-2 text-sm"
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{entry.item?.model || entry.query}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {entry.item
                          ? [entry.item.brand, entry.item.packageName, entry.item.lcscCode]
                              .filter(Boolean)
                              .join(" · ")
                          : entry.message || meta.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {stats.ok > 0 && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="min-w-[12rem] flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">全部入库到</Label>
                <Select value={boxId} onValueChange={setBoxId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择容器" />
                  </SelectTrigger>
                  <SelectContent>
                    {boxes.map((box) => (
                      <SelectItem key={box.id} value={String(box.id)}>
                        {box.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={inboundAll} disabled={inbounding || !boxId}>
                {inbounding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PackagePlus className="size-4" />
                )}
                全部入库（{stats.ok}）
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
