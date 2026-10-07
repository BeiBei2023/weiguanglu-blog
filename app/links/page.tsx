import { site } from "@/lib/site";
import { FRIEND_LINKS } from "@/lib/links";
import { Link2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

export const metadata = {
  title: "友链",
  description: `${site.name}的友情链接：这里列出常来常往的站点，也提供交换友链的方式与本站信息，欢迎互相串门。`,
  alternates: { canonical: "/links" },
};

export default function LinksPage() {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-8">
      <Panel>
        <PageHeader
          title="友链"
          description="互相串门的站点。也欢迎把我的站点加进你的友链里。"
        />

        {FRIEND_LINKS.length === 0 ? (
          <EmptyState icon={Link2} title="还没有友链" description="欢迎来交换友链，下方有本站信息。" />
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {FRIEND_LINKS.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex gap-3 rounded-2xl border border-border/60 bg-accent/10 p-4 transition-colors hover:border-primary/40"
                >
                  {item.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.avatar}
                      alt={item.name}
                      width={40}
                      height={40}
                      loading="lazy"
                      className="size-10 shrink-0 rounded-full border border-border/60 object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-primary/15 font-heading text-sm font-semibold text-primary">
                      {item.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{item.name}</span>
                      {item.tags?.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{item.url}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-8 rounded-2xl border border-border/60 bg-accent/10 p-5">
          <h2 className="font-heading text-base font-semibold">交换友链</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            如果我的内容对你有用，欢迎交换友链——在任意文章的评论区留言
            {site.github ? (
              <>
                ，或到{" "}
                <a
                  href={`https://github.com/${site.github}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-1 text-primary hover:underline"
                >
                  GitHub
                </a>
                找我
              </>
            ) : null}
            。请把你的站点名、地址、一句话介绍（和头像）发我。
          </p>
          <p className="mt-4 text-xs font-medium text-muted-foreground">本站信息（可直接复制）</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-border/50 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
{`名称：${site.name}
地址：${site.url}
描述：${site.slogan}
头像：${site.url}/avatar.jpg${site.github ? `\nGitHub：https://github.com/${site.github}` : ""}`}
          </pre>
        </section>
      </Panel>
    </div>
  );
}
