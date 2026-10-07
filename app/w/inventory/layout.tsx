import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import { Toaster } from "@/components/ui/sonner";
import { buildStockInBoxes } from "@/lib/inventory/domain";
import { readInventory } from "@/lib/inventory/store";
import { BackToWorkbench } from "@/components/w/back-to-workbench";

export const dynamic = "force-dynamic";

export default async function InventoryLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/inventory");

  const data = await readInventory();
  const boxes = buildStockInBoxes(data);

  return (
    <div className="inventory-scope mx-auto w-full max-w-[1100px] px-4 py-8">
      <div className="mb-3">
        <BackToWorkbench />
      </div>
      <InventoryNav boxes={boxes} />
      <div className="mt-4">{children}</div>
      <Toaster position="top-center" />
    </div>
  );
}
