import { redirect } from "next/navigation";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** 旧的「全部元件」列表页已并入单页库存；跳转时保留搜索参数 */
export default async function InventoryAllRedirect({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const target = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) target.set(key, value);
  }
  redirect(`/w/inventory${target.size ? `?${target.toString()}` : ""}`);
}
