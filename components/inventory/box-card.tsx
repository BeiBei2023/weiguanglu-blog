"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { Package, Settings, Wand2 } from "lucide-react";
import { deleteBoxAction, suggestStartAction, updateBoxAction } from "@/app/w/inventory/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_BOX_TYPES, type BoxGroupItem } from "@/lib/inventory/domain";
import { SubmitButton } from "./submit-button";

interface Props {
  item: BoxGroupItem;
}

export function BoxCard({ item }: Props) {
  const box = item.box;
  const meta = DEFAULT_BOX_TYPES[box.boxType];
  const [deleteState, deleteAction] = useActionState(deleteBoxAction, null);
  const { confirm, confirmDialog } = useConfirm();

  const usagePct = Math.round((item.usedCount / box.slotCapacity) * 100);

  return (
    <article className="glass group rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="truncate font-medium">{box.name}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {box.description || meta.label}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span
              aria-hidden
              className="relative grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--primary) 0% ${usagePct}%, color-mix(in oklab, var(--muted-foreground) 28%, transparent) ${usagePct}% 100%)`,
              }}
            >
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-background/85 text-[10.5px] font-semibold tabular-nums backdrop-blur-sm">
                {usagePct}%
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              已用 {item.usedCount}/{box.slotCapacity}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            前缀 {box.slotPrefix} · 范围 {item.slotRange}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="transition-colors">
          <Link href={`/w/inventory/box/${box.id}`}>进入</Link>
        </Button>
        <BoxSettingsDialog item={item} />
        <form
          action={deleteAction}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void (async () => {
              const ok = await confirm({
                title: `删除容器「${box.name}」？`,
                description:
                  item.usedCount > 0
                    ? `容器内有 ${item.usedCount} 条元件记录，会一并删除，不可撤销。`
                    : "该容器还没有元件记录，删除后不可撤销。",
                confirmLabel: "删除容器",
              });
              if (!ok) return;
              deleteAction(new FormData(form));
            })();
          }}
        >
          <input type="hidden" name="boxId" value={box.id} />
          <SubmitButton variant="destructive" size="sm" pendingText="删除中…">
            删除
          </SubmitButton>
        </form>
      </div>
      {deleteState?.error ? (
        <p className="mt-2 text-xs text-destructive">{deleteState.error}</p>
      ) : null}
      {confirmDialog}
    </article>
  );
}

function BoxSettingsDialog({ item }: Props) {
  const box = item.box;
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateBoxAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState("");
  const [suggesting, startSuggest] = useTransition();
  const values = state?.values;

  const handleSuggest = () => {
    const form = formRef.current;
    if (!form) return;
    const prefixEl = form.elements.namedItem("slotPrefix") as HTMLInputElement | null;
    const capacityEl = form.elements.namedItem("slotCapacity") as HTMLInputElement | null;
    const startEl = form.elements.namedItem("startNumber") as HTMLInputElement | null;
    startSuggest(async () => {
      const res = await suggestStartAction({
        boxType: box.boxType,
        slotPrefix: prefixEl?.value ?? "",
        slotCapacity: capacityEl?.value ? Number(capacityEl.value) : undefined,
        boxId: box.id,
      });
      if (!res.ok) {
        setPreview(res.message ?? "建议起始号失败");
        return;
      }
      if (startEl) startEl.value = String(res.startNumber ?? 1);
      if (prefixEl && !prefixEl.value.trim()) prefixEl.value = res.slotPrefix ?? "";
      setPreview(`建议范围: ${res.previewRange}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="size-3.5" />
          设置
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>容器设置</DialogTitle>
          <DialogDescription>
            改格数/起始号会自动重算名称与编号范围（如 中盒B B1-B30）
          </DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          key={values ? JSON.stringify(values) : "init"}
          action={formAction}
          className="space-y-3"
        >
          <input type="hidden" name="boxId" value={box.id} />
          <input type="hidden" name="boxType" value={box.boxType} />
          <div className="grid gap-3 sm:grid-cols-2 wgl-cells">
            <div className="space-y-1.5">
              <Label htmlFor={`box-name-${box.id}`}>基础名称</Label>
              <Input
                id={`box-name-${box.id}`}
                name="baseName"
                required
                defaultValue={values?.baseName ?? item.baseName}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`box-prefix-${box.id}`}>编号前缀</Label>
              <Input
                id={`box-prefix-${box.id}`}
                name="slotPrefix"
                required
                defaultValue={values?.slotPrefix ?? box.slotPrefix}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`box-capacity-${box.id}`}>格数</Label>
              <Input
                id={`box-capacity-${box.id}`}
                name="slotCapacity"
                type="number"
                min={1}
                max={1000}
                defaultValue={values?.slotCapacity ?? String(box.slotCapacity)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`box-start-${box.id}`}>起始序号</Label>
              <Input
                id={`box-start-${box.id}`}
                name="startNumber"
                type="number"
                min={0}
                defaultValue={values?.startNumber ?? String(box.startNumber)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`box-desc-${box.id}`}>备注</Label>
              <Input
                id={`box-desc-${box.id}`}
                name="description"
                defaultValue={values?.description ?? box.description}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleSuggest} disabled={suggesting}>
              <Wand2 className="size-3.5" />
              建议起始号
            </Button>
            <SubmitButton pendingText="保存中…">保存设置</SubmitButton>
            {preview ? (
              <span className="text-xs text-muted-foreground">{preview}</span>
            ) : null}
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
