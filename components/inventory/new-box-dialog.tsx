"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, Wand2 } from "lucide-react";
import { createBoxAction, suggestStartAction } from "@/app/w/inventory/actions";
import { Button } from "@/components/ui/button";
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
import { DEFAULT_BOX_TYPES } from "@/lib/inventory/domain";
import { BOX_TYPES, type BoxType } from "@/lib/inventory/types";

export function NewBoxDialog() {
  const [open, setOpen] = useState(false);
  const [boxType, setBoxType] = useState<BoxType>("small_28");
  const [state, formAction] = useActionState(createBoxAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState("");
  const [suggesting, startSuggest] = useTransition();

  const meta = DEFAULT_BOX_TYPES[boxType];
  const values = state?.values;

  const handleSuggest = () => {
    const form = formRef.current;
    if (!form) return;
    const prefixEl = form.elements.namedItem("slotPrefix") as HTMLInputElement | null;
    const capacityEl = form.elements.namedItem("slotCapacity") as HTMLInputElement | null;
    const startEl = form.elements.namedItem("startNumber") as HTMLInputElement | null;
    startSuggest(async () => {
      const res = await suggestStartAction({
        boxType,
        slotPrefix: prefixEl?.value ?? "",
        slotCapacity: capacityEl?.value ? Number(capacityEl.value) : undefined,
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
        <Button size="sm">
          <Plus className="size-3.5" />
          新增容器
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新增容器</DialogTitle>
          <DialogDescription>
            选一个盒型（默认格数可改），名称会按「基础名 + 编号范围」自动生成
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {BOX_TYPES.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={boxType === key ? "default" : "outline"}
              onClick={() => setBoxType(key)}
            >
              {DEFAULT_BOX_TYPES[key].label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{meta.defaultDesc}</p>

        <form
          ref={formRef}
          key={values ? JSON.stringify(values) + boxType : `init-${boxType}`}
          action={formAction}
          className="space-y-3"
        >
          <input type="hidden" name="boxType" value={boxType} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="box-base-name">基础名称</Label>
              <Input
                id="box-base-name"
                name="baseName"
                required
                placeholder="如 小盒A / 中盒B"
                defaultValue={values?.baseName ?? ""}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="box-prefix">编号前缀</Label>
              <Input
                id="box-prefix"
                name="slotPrefix"
                placeholder={`默认 ${meta.defaultPrefix}`}
                defaultValue={values?.slotPrefix ?? ""}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="box-capacity">格数</Label>
              <Input
                id="box-capacity"
                name="slotCapacity"
                type="number"
                min={1}
                max={1000}
                defaultValue={values?.slotCapacity ?? String(meta.defaultCapacity)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="box-start">起始序号</Label>
              <Input
                id="box-start"
                name="startNumber"
                type="number"
                min={0}
                defaultValue={values?.startNumber ?? "1"}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="box-description">备注</Label>
              <Input
                id="box-description"
                name="description"
                placeholder="可选"
                defaultValue={values?.description ?? ""}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleSuggest} disabled={suggesting}>
              <Wand2 className="size-3.5" />
              建议起始号
            </Button>
            <Button type="submit">创建并进入</Button>
            {preview ? (
              <span className="text-xs text-muted-foreground">{preview}</span>
            ) : null}
          </div>
          {state?.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
