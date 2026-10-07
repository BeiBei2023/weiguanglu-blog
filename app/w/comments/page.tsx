import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExternalLink, MessageSquare } from "lucide-react";
import { BackToWorkbench } from "@/components/w/back-to-workbench";
import { Toaster } from "@/components/ui/sonner";
import { CommentsToolbar } from "@/components/comments/comments-toolbar";
import { getServerSession } from "@/lib/auth/server";
import { readComments } from "@/lib/comments-feed";
import { formatClock, formatAgo } from "@/lib/format";

export const metadata: Metadata = { title: "评论动态" };
export const dynamic = "force-dynamic";



export default async function CommentsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/w/comments");

  const feed = await readComments();
  // 用「本次拉取 feed 的时间」当基准，避免在渲染里读系统时间（react-hooks/purity）
  const anchor = Date.parse(feed.at);
  const now = Number.isNaN(anchor) ? 0 : anchor;

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-4 px-4 py-8">
      <header>
        <BackToWorkbench />
        <h1 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold">
          <MessageSquare className="h-5 w-5 text-primary" />
          评论动态
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          有没有人评论一眼看到。评论区用的是 giscus，评论都存在 GitHub 仓库{" "}
          <a
            className="font-mono underline-offset-2 hover:text-primary hover:underline"
            href={`https://github.com/${feed.repo}/discussions`}
            target="_blank"
            rel="noreferrer"
          >
            {feed.repo}
          </a>{" "}
          的 Discussions 里，这里直接读它的公开动态（不需要 token），回复详情点「去 GitHub 看」。
        </p>
      </header>

      <div className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl p-4 text-xs">
        <span className="flex items-center gap-1.5">
          <MessageSquare className="size-3.5 text-primary" />
          动态 <span className="tabular-nums">{feed.threads.length}</span> 条
        </span>
        <span className={feed.unread > 0 ? "font-medium text-primary" : "text-muted-foreground"}>
          未读 <span className="tabular-nums">{feed.unread}</span>
        </span>
        <span className="text-muted-foreground">最新 {feed.latest ? formatAgo(feed.latest, now) : "—"}</span>
        <span className="text-muted-foreground">
          上次查看 {feed.seen ? formatClock(feed.seen) : "（还没标过已读）"}
        </span>
        <span className="ml-auto">
          <CommentsToolbar unread={feed.unread} />
        </span>
      </div>

      {feed.unread > 0 ? (
        <p className="glass rounded-2xl border border-primary/30 bg-primary/5 p-4 text-xs font-medium text-primary">
          🔔 有 {feed.unread} 条新动态（比上次查看更新）
        </p>
      ) : null}

      {feed.error ? (
        <p className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          拉取 GitHub 动态失败：{feed.error}（GitHub 偶发抽风时点「刷新」再试；不影响站点上的评论区本身）
        </p>
      ) : null}

      {!feed.error && feed.threads.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          还没有人评论。等有人在第一篇下面留言，这里就会出现。
        </p>
      ) : null}

      <ul className="space-y-3">
        {feed.threads.map((thread) => {
          const isNew = !feed.seen || thread.updated > feed.seen;
          return (
            <li key={thread.id || thread.url} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2">
                {isNew ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">新</span>
                ) : null}
                {thread.link ? (
                  <a
                    href={thread.link}
                    className="font-heading text-sm font-semibold underline-offset-2 hover:text-primary hover:underline"
                  >
                    {thread.label}
                  </a>
                ) : (
                  <span className="font-heading text-sm font-semibold">{thread.label}</span>
                )}
                <span className="font-mono text-[11px] text-muted-foreground">{thread.key}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {thread.updated ? formatAgo(thread.updated, now) : ""}
                </span>
              </div>

              <div className="mt-2 flex items-start gap-2">
                {thread.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thread.avatar}
                    alt=""
                    width={20}
                    height={20}
                    className="mt-0.5 size-5 shrink-0 rounded-full"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{thread.author}</p>
                  <p className="mt-1 break-words text-sm leading-relaxed">{thread.excerpt || "（没有正文）"}</p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <a
                  className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  href={thread.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" />
                  去 GitHub 看
                </a>
                {thread.link ? (
                  <a
                    className="text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                    href={`${thread.link}#comments`}
                  >
                    看文章里的评论区
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        说明：GitHub 的公开动态只给最近 20 条，所以这里是「有没有新评论」的看板与最近动态；某个讨论下的全部回复要去
        GitHub 看。想第一时间收到通知，可以在 GitHub 上把这个仓库 Watch 起来（Watch → Custom → 勾上 Discussions），
        新评论会直接进邮箱。
      </p>

      <Toaster position="top-center" />
    </div>
  );
}
