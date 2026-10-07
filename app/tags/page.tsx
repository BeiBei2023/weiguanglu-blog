import Link from "next/link";
import { getTagCounts } from "@/lib/content";
import { Tags } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "标签",
  description: `按标签浏览${site.name}的全部文章：汇总站内所有标签及其文章数量，点击标签即可查看对应文章列表。`,
  alternates: { canonical: "/tags" },
};

export default function TagsPage() {
  const tags = getTagCounts();
  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-8">
      <Panel>
        <PageHeader title="标签" meta={`共 ${tags.length} 个标签`} />
        {tags.length === 0 ? (
          <EmptyState icon={Tags} title="还没有标签" description="文章打上标签之后，这里会自动汇总。" />
        ) : (
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
            {tags.map((t) => (
              <Link
                key={t.tag}
                href={`/tags/${encodeURIComponent(t.tag)}`}
                className="text-primary hover:underline"
              >
                #{t.tag} <span className="text-sm text-muted-foreground">{t.count}</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
