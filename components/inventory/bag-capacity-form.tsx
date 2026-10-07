"use client";

import { useActionState } from "react";
import { updateBagCapacityAction } from "@/app/w/inventory/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  boxId: number;
  slotCapacity: number;
}

export function BagCapacityForm({ boxId, slotCapacity }: Props) {
  const [state, formAction] = useActionState(updateBagCapacityAction, null);
  const values = state?.values;
  const formKey = values ? JSON.stringify(values) : "initial";

  return (
    <form
      key={formKey}
      action={formAction}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/50 px-3 py-2"
    >
      <input type="hidden" name="boxId" value={boxId} />
      <Label htmlFor="bag-slot-capacity" className="text-xs text-muted-foreground">
        袋位数量
      </Label>
      <Input
        id="bag-slot-capacity"
        name="slotCapacity"
        type="number"
        min={1}
        max={1000}
        defaultValue={values?.slotCapacity ?? String(slotCapacity)}
        className="h-7 w-20 text-xs"
      />
      <Button type="submit" variant="secondary" size="sm">
        更新
      </Button>
      {state?.error ? (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
