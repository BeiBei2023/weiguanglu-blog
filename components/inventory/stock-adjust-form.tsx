"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { quickOutboundAction, quickRestockAction } from "@/app/w/inventory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  componentId: number;
  max?: number;
  defaultAmount?: number;
}

export function StockAdjustForm({ componentId, max, defaultAmount = 1 }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [pending, startTransition] = useTransition();

  const adjust = (direction: "in" | "out") => {
    const value = Number.parseInt(amount, 10);
    if (!Number.isInteger(value) || value <= 0) {
      toast.error("数量必须大于 0");
      return;
    }
    startTransition(async () => {
      const result =
        direction === "out"
          ? await quickOutboundAction({ componentId, amount: value })
          : await quickRestockAction({ componentId, amount: value });
      if (result.ok) {
        toast.success(result.notice ?? "操作成功");
        router.refresh();
      } else {
        toast.error(result.error ?? "操作失败");
      }
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={1}
        max={max}
        inputMode="numeric"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        aria-label="数量"
        title="调整数量"
        className="h-7 w-14 px-1.5 text-xs"
      />
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        title="出库"
        aria-label="出库"
        disabled={pending}
        onClick={() => adjust("out")}
      >
        <Minus className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        title="入库"
        aria-label="入库"
        disabled={pending}
        onClick={() => adjust("in")}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}
