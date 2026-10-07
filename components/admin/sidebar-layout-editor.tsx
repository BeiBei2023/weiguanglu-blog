"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from "lucide-react";
import { cn } from "cn";
import { WIDGET_CATALOG, type SidebarLayout } from "@/lib/widgets/catalog";

const LABEL: Record<string, string> = Object.fromEntries(
  WIDGET_CATALOG.map((widget) => [widget.id, widget.label]),
);

const BTN =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30";

export function SidebarLayoutEditor({
  title,
  layout,
  onChange,
}: {
  title: string;
  layout: SidebarLayout;
  onChange: (next: SidebarLayout) => void;
}) {
  const used = new Set([...layout.left, ...layout.right]);
  const hidden = WIDGET_CATALOG.filter((widget) => !used.has(widget.id));

  function reorder(col: "left" | "right", index: number, dir: -1 | 1) {
    const next = [...layout[col]];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...layout, [col]: next });
  }

  function toOther(from: "left" | "right", index: number) {
    const to = from === "left" ? "right" : "left";
    const next = [...layout[from]];
    const [item] = next.splice(index, 1);
    onChange({ ...layout, [from]: next, [to]: [...layout[to], item] });
  }

  function remove(from: "left" | "right", index: number) {
    const next = [...layout[from]];
    next.splice(index, 1);
    onChange({ ...layout, [from]: next });
  }

  function add(to: "left" | "right", id: string) {
    onChange({ ...layout, [to]: [...layout[to], id] });
  }

  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium">
        {title}
        <span className="text-xs text-muted-foreground tabular-nums">
          {layout.left.length + layout.right.length} 个
        </span>
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["left", "right"] as const).map((col) => (
          <div key={col} className="rounded-2xl border border-border/70 bg-surface p-3">
            <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{col === "left" ? "左列" : "右列"}</span>
              <span className="tabular-nums">{layout[col].length}</span>
            </p>
            {layout[col].length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
                拖入或从下方「未使用」添加
              </p>
            ) : (
              <ul className="space-y-1">
                {layout[col].map((id, index) => (
                  <li
                    key={id}
                    className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2 py-1 text-xs transition-colors hover:border-primary/50"
                  >
                    <span className="min-w-0 flex-1 truncate">{LABEL[id] ?? id}</span>
                    <button
                      type="button"
                      aria-label="上移"
                      title="上移"
                      disabled={index === 0}
                      onClick={() => reorder(col, index, -1)}
                      className={BTN}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
                      title="下移"
                      disabled={index === layout[col].length - 1}
                      onClick={() => reorder(col, index, 1)}
                      className={BTN}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="移到另一列"
                      title="移到另一列"
                      onClick={() => toOther(col, index)}
                      className={BTN}
                    >
                      {col === "left" ? (
                        <ArrowRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowLeft className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="隐藏"
                      title="隐藏（不显示）"
                      onClick={() => remove(col, index)}
                      className={cn(BTN, "hover:border-destructive hover:text-destructive")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">未使用（放回某列）</p>
          <ul className="flex flex-wrap gap-2">
            {hidden.map((widget) => (
              <li
                key={widget.id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 py-0.5 pl-2.5 pr-1 text-xs"
              >
                {widget.label}
                <button
                  type="button"
                  title="放到左列"
                  aria-label="放到左列"
                  onClick={() => add("left", widget.id)}
                  className={BTN}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="放到右列"
                  aria-label="放到右列"
                  onClick={() => add("right", widget.id)}
                  className={BTN}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <ArrowRight className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
