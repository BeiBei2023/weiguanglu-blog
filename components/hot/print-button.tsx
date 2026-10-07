"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 打印 / 存为 PDF（浏览器自带的打印对话框，手机也能用） */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="size-4" />
      打印 / 存为 PDF
    </Button>
  );
}
