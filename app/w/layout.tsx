import type { ReactNode } from "react";

/**
 * 工作站外壳：把整块内容放进 `.w-scope`（读数等宽数字对齐等统一规则挂在这个作用域上）。
 *
 * 机架读数条不在这里渲染了 —— 它已并进顶部导航栏（`components/layout/site-header.tsx`，
 * 靠 `proxy.ts` 透出的 `x-pathname` 判断是不是工作台页面），避免出现两条。
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <div className="w-scope pt-6">{children}</div>;
}
