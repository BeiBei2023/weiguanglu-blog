import { redirect } from "next/navigation";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function InventoryPartsRedirect({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const target = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) target.set(key, value);
  }
  redirect(`/w/inventory${target.size ? `?${target.toString()}` : ""}`);
}
