import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { ImagesPanel } from "@/components/images/images-panel";
import { getServerSession } from "@/lib/auth/server";
import { listMedia, listTrash, mediaStats } from "@/lib/images";
import { getSiteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "素材台" };
export const dynamic = "force-dynamic";

export default async function ImagesPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/images");

  const items = listMedia();
  const stats = mediaStats(items);
  const trash = listTrash();
  const { imageHotlink } = getSiteConfig();

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <Images className="h-5 w-5 text-primary" />
          素材台
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          拖进来就能上传（也可以直接 Ctrl+V 粘贴），图库看体积、被哪些文章引用、alt 文本，复制 Markdown
          一键带走；没用的先丢回收站，确认后再彻底删除。
        </p>
      </header>
      <ImagesPanel items={items} stats={stats} trash={trash} hotlink={imageHotlink} />
      <Toaster position="top-center" />
    </div>
  );
}
