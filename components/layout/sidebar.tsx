import type { CSSProperties } from "react";
import type { SidebarWidth } from "@/lib/widgets/catalog";
import { resolveWidgets, type WidgetProps } from "@/lib/widgets/registry";

/** 侧栏宽度 → 页面网格使用的 CSS 变量（--sb-left / --sb-right） */
export function sidebarWidthVars(width: SidebarWidth): CSSProperties {
  return {
    "--sb-left": `${width.left}px`,
    "--sb-right": `${width.right}px`,
  } as CSSProperties;
}

/** 一列侧栏：每个挂件各自独立的玻璃卡片（定位/固定由 SidebarColumn 负责） */
export function Sidebar({ items, ...props }: WidgetProps & { items: string[] }) {
  const defs = resolveWidgets(items);
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((widget) => (
        <div key={widget.id} className="glass-soft rounded-3xl p-5">
          <widget.component {...props} />
        </div>
      ))}
    </>
  );
}
