import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getServerSession } from "@/lib/auth/server";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { HotItemAi } from "@/components/hot/hot-item-ai";
import { Button } from "@/components/ui/button";
import { findHotItem } from "@/lib/hot";
import { readAiItemNote } from "@/lib/ai-item";

export const metadata = { title: "热点详情" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function HotItemPage({ params }: { params: Params }) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/hot");

  const { id } = await params;
  const found = findHotItem(id);

  if (!found) {
    return (
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 py-8">
        <BackToWorkbench />
        <section className="glass rounded-2xl p-6">
          <h1 className="font-heading text-xl font-bold">这条热点已经翻篇了</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            热点每小时刷新一次，这条大概已经被挤下去了。回热点页看看最新的。
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/w/hot">返回热点信息</Link>
          </Button>
        </section>
      </div>
    );
  }

  const { item, source } = found;
  const note = readAiItemNote(id);

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 font-heading text-xl font-bold leading-snug">{item.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{source.name}</span>
          {item.meta ? <span>· {item.meta}</span> : null}
        </p>
      </header>

      <section className="glass rounded-2xl p-5">
        {item.summary ? (
          <p className="text-sm leading-relaxed text-foreground/90">{item.summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            这条没有抓到摘要 —— 可以让下面的 AI 详细说说，或者直接看原文。
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              看原文
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/w/hot">返回热点</Link>
          </Button>
        </div>
      </section>

      {source.id === "github" ? (
        <HotItemAi
          id={item.id}
          title={item.title}
          url={item.url}
          meta={item.meta}
          summary={item.summary}
          initialNote={note}
        />
      ) : (
        <section className="glass rounded-2xl p-5 text-sm text-muted-foreground">
          AI 解说只在「GitHub 新星」上开放（这条来自 {source.name}）。
        </section>
      )}
    </div>
  );
}
