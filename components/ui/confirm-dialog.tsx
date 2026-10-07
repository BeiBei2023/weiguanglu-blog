"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作（删除/覆盖）用红色确认按钮；默认 true */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * 站内确认框，替代原生 window.confirm（风格统一，且不会卡住自动化脚本）。
 *
 * 用法：
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "删除？", description: "不可撤销。", confirmLabel: "删除" }))) return;
 *   ...
 *   return (<div>…{confirmDialog}</div>);
 *
 * 取消途径：取消按钮 / ESC / 点击遮罩（与原生 confirm 的直觉一致）→ 一律返回 false。
 * 注意：这里用 Dialog 而非 AlertDialog——Radix 的 AlertDialog 刻意禁用了「点遮罩关闭」。
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  /** resolve 幂等：确认后 Radix 还会再触发一次 onOpenChange(false)，重复结算无副作用 */
  const settle = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  const confirmDialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description ? (
            <DialogDescription>{pending.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          {/* autoFocus 给「取消」：危险操作回车默认不生效 */}
          <Button type="button" variant="outline" autoFocus onClick={() => settle(false)}>
            {pending?.cancelLabel ?? "取消"}
          </Button>
          <Button
            type="button"
            variant={pending?.destructive === false ? "default" : "destructive"}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel ?? "确定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
