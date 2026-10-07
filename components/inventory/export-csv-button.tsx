"use client";

import Papa from "papaparse";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  rows: Record<string, unknown>[];
  filename: string;
  label?: string;
  className?: string;
}

export function ExportCsvButton({ rows, filename, label = "导出 CSV", className }: Props) {
  const handleExport = () => {
    if (!rows.length) return;
    const csv = Papa.unparse(rows, { quotes: true });
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `${filename}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={!rows.length}
      className={className}
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}
