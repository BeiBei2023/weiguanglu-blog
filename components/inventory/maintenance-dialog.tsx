"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadCloud, Loader2, Sparkles, Wand2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { tidyInventoryAction } from "@/app/w/inventory/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LocalizeStatus {
  images: number;
  datasheets: number;
  total: number;
}

interface UpgradeStatus {
  pending: number;
  total: number;
}

interface UpgradeStep {
  upgraded: number;
  skipped: number;
  failed: number;
  remaining: number;
  rateLimited: boolean;
  samples?: string[];
  failedIds?: number[];
  errors?: string[];
  error?: string;
}

interface LocalizeStep extends LocalizeStatus {
  downloaded: number;
  failed: number;
  remaining: number;
  rateLimited: boolean;
  error?: string;
}

/** 「维护」：升级旧数据（按立创补齐参数/图片）/ 本地化资源 / 整理字段 */
export function MaintenanceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [localize, setLocalize] = useState<LocalizeStatus | null>(null);
  const [upgrade, setUpgrade] = useState<UpgradeStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    try {
      const [localizeResponse, upgradeResponse] = await Promise.all([
        fetch("/api/w/inventory/localize", { cache: "no-store" }),
        fetch("/api/w/inventory/upgrade", { cache: "no-store" }),
      ]);
      const localizePayload = (await localizeResponse.json()) as LocalizeStatus & { error?: string };
      const upgradePayload = (await upgradeResponse.json()) as UpgradeStatus & { error?: string };
      if (!localizeResponse.ok) throw new Error(localizePayload.error ?? "读取失败");
      if (!upgradeResponse.ok) throw new Error(upgradePayload.error ?? "读取失败");
      setLocalize({
        images: localizePayload.images,
        datasheets: localizePayload.datasheets,
        total: localizePayload.total,
      });
      setUpgrade({ pending: upgradePayload.pending, total: upgradePayload.total });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败");
    }
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    setMessage(null);
    if (next) void loadStatuses();
  }

  async function refresh() {
    router.refresh();
    await loadStatuses();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="升级旧数据 / 本地化资源 / 整理字段">
          <Wrench className="size-4" />
          维护
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>数据维护</DialogTitle>
          <DialogDescription>
            都是分批进行的，随时可以中断、下次接着来；文件都存在本站 data/ 目录，随备份走。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upgrade">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upgrade">升级旧数据</TabsTrigger>
            <TabsTrigger value="localize">本地化资源</TabsTrigger>
            <TabsTrigger value="tidy">整理字段</TabsTrigger>
          </TabsList>

          <TabsContent value="upgrade" className="mt-3">
            <UpgradePanel status={upgrade} onDone={refresh} />
          </TabsContent>
          <TabsContent value="localize" className="mt-3">
            <LocalizePanel status={localize} onDone={refresh} />
          </TabsContent>
          <TabsContent value="tidy" className="mt-3">
            <TidyPanel onDone={refresh} />
          </TabsContent>
        </Tabs>

        {message && <p className="text-xs text-amber-600">{message}</p>}
      </DialogContent>
    </Dialog>
  );
}

function UpgradePanel({
  status,
  onDone,
}: {
  status: UpgradeStatus | null;
  onDone: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const stopRef = useRef(false);

  const pending = remaining ?? status?.pending ?? 0;
  const total = done + pending;
  const percent = total ? Math.round((done / total) * 100) : 100;

  async function start() {
    stopRef.current = false;
    setRunning(true);
    setDone(0);
    setSkipped(0);
    setFailed(0);
    setSamples([]);
    setNote(null);

    let ok = 0;
    let skip = 0;
    let bad = 0;
    const sampleList: string[] = [];
    const excluded: number[] = [];
    let lastError: string | null = null;

    for (let round = 0; round < 2000; round += 1) {
      if (stopRef.current) break;
      let payload: UpgradeStep | null = null;
      try {
        const response = await fetch("/api/w/inventory/upgrade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "step", exclude: excluded.slice(-800) }),
        });
        const data = (await response.json()) as UpgradeStep;
        if (!response.ok) throw new Error(data.error ?? "升级失败");
        payload = data;
      } catch (error) {
        setNote(error instanceof Error ? error.message : "升级失败");
        break;
      }
      if (!payload) break;

      ok += payload.upgraded ?? 0;
      skip += payload.skipped ?? 0;
      bad += payload.failed ?? 0;
      setDone(ok);
      setSkipped(skip);
      setFailed(bad);
      setRemaining(payload.remaining ?? 0);
      if (payload.failedIds?.length) excluded.push(...payload.failedIds);
      if (payload.errors?.length) lastError = payload.errors[0];
      if (payload.samples?.length) {
        sampleList.push(...payload.samples);
        setSamples(sampleList.slice(0, 5));
      }

      if (!payload.remaining) break;
      if (payload.rateLimited) {
        setNote(`立创似乎限流了，剩余 ${payload.remaining} 个稍后再试`);
        break;
      }
      if (!payload.upgraded && !payload.failed && !payload.skipped) {
        setNote(`剩余 ${payload.remaining} 个暂时补不全（多为立创没有图/参数，或型号匹配不唯一）`);
        break;
      }
    }

    if (lastError && !stopRef.current) {
      setNote((prev) => prev ?? `最近一次未成功：${lastError}`);
    }
    setRunning(false);
    if (!stopRef.current) await onDone();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        待升级：<span className="font-medium text-foreground">{pending}</span> 个元件
        {status ? `（共 ${status.total} 个）` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        按立创编号精确匹配；只有型号的会先搜索，命中唯一才采用。会补齐型号 / 品牌 / 封装 / 分类 / 参数表 / 数据手册 /
        参考图（图片立即下载到本地），<span className="text-foreground">盒位、数量、备注一律不动</span>。
      </p>

      <Progress value={percent} className="h-2" />
      <p className="text-xs text-muted-foreground">
        已升级 {done} 个{skipped ? `，跳过 ${skipped} 个（需人工确认）` : ""}
        {failed ? `，失败 ${failed} 个` : ""}（{percent}%）
      </p>
      {samples.length > 0 && (
        <p className="text-xs text-muted-foreground">跳过示例：{samples.join("、")}</p>
      )}
      {note && <p className="text-xs text-amber-600">{note}</p>}

      <div className="flex items-center gap-2 pt-1">
        {running ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            停止
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!pending} onClick={() => void start()}>
            <Wand2 className="size-4" />
            {done ? "继续升级" : "开始升级"}
          </Button>
        )}
        {running && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            处理中…（约每 2 秒一个，可以先去忙别的）
          </span>
        )}
      </div>
    </div>
  );
}

function LocalizePanel({
  status,
  onDone,
}: {
  status: LocalizeStatus | null;
  onDone: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const stopRef = useRef(false);

  const pending = remaining ?? status?.total ?? 0;
  const total = downloaded + pending;
  const percent = total ? Math.round((downloaded / total) * 100) : 100;

  async function start() {
    stopRef.current = false;
    setRunning(true);
    setDownloaded(0);
    setFailed(0);
    setNote(null);

    let ok = 0;
    let bad = 0;

    for (let round = 0; round < 2000; round += 1) {
      if (stopRef.current) break;
      let payload: LocalizeStep | null = null;
      try {
        const response = await fetch("/api/w/inventory/localize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        });
        const data = (await response.json()) as LocalizeStep;
        if (!response.ok) throw new Error(data.error ?? "下载失败");
        payload = data;
      } catch (error) {
        setNote(error instanceof Error ? error.message : "下载失败");
        break;
      }
      if (!payload) break;

      ok += payload.downloaded ?? 0;
      bad += payload.failed ?? 0;
      setDownloaded(ok);
      setFailed(bad);
      setRemaining(payload.remaining ?? 0);

      if (!payload.remaining) break;
      if (payload.rateLimited) {
        setNote(`立创似乎限流了，剩余 ${payload.remaining} 个稍后再试`);
        break;
      }
      if (!payload.downloaded) {
        setNote(`剩余 ${payload.remaining} 个资源暂时下不动，稍后可再试`);
        break;
      }
    }

    setRunning(false);
    if (!stopRef.current) await onDone();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        待下载：<span className="font-medium text-foreground">{pending}</span> 个
        {status ? `（图片 ${status.images} / 手册 ${status.datasheets}）` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        把库里仍是远程地址的参考图与数据手册下载到本站；手册 PDF 体积较大，按需再下也行。
        <br />
        服务器每 6 小时会自动检查一次（新识别的元件即时本地化），这里手动点只是立即执行。
      </p>

      <Progress value={percent} className="h-2" />
      <p className="text-xs text-muted-foreground">
        已下载 {downloaded} 个{failed ? `，失败 ${failed} 个` : ""}（{percent}%）
      </p>
      {note && <p className="text-xs text-amber-600">{note}</p>}

      <div className="flex items-center gap-2 pt-1">
        {running ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            停止
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!pending} onClick={() => void start()}>
            <DownloadCloud className="size-4" />
            {downloaded ? "继续下载" : "开始下载"}
          </Button>
        )}
        {running && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            下载中…
          </span>
        )}
      </div>
    </div>
  );
}

function TidyPanel({ onDone }: { onDone: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setNote(null);
    const result = await tidyInventoryAction();
    setRunning(false);
    if (!result.ok) {
      toast.error(result.error ?? "整理失败");
      setNote(result.error ?? "整理失败");
      return;
    }
    toast.success(result.notice ?? "整理完成");
    setNote(result.notice ?? "整理完成");
    await onDone();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        把旧记录备注里解析出的立创信息（编号 / 品牌 / 封装 / 参数表 / 数据手册）一次性落盘为结构化字段；不影响盒位、数量与备注。
      </p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" size="sm" disabled={running} onClick={() => void run()}>
          <Sparkles className={running ? "size-4 animate-pulse" : "size-4"} />
          {running ? "整理中…" : "开始整理"}
        </Button>
      </div>
    </div>
  );
}
