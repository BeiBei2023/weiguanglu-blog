import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Code2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { SnippetsPanel } from "@/components/snippets/snippets-panel";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { getServerSession } from "@/lib/auth/server";
import { listSnippets, snippetStats } from "@/lib/snippets";

export const metadata: Metadata = { title: "片段备忘" };
export const dynamic = "force-dynamic";

export default async function SnippetsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/snippets");

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <Code2 className="h-5 w-5 text-primary" />
          片段备忘
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          常用命令、ESP-IDF 片段、SQL、正则……存这里，带标签与搜索，一键复制。
        </p>
      </header>

      <SnippetsPanel initial={listSnippets()} stats={snippetStats()} />
      <Toaster position="top-center" />
    </div>
  );
}
