import { notFound } from "next/navigation";
import { getPage } from "@/lib/content/pages";
import { renderMarkdown } from "@/lib/markdown/render";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "开源说明",
  description: `开源说明：列出${site.name}用到的开源项目、直接引用或改写的代码与数据（含用途、出处与许可），并作合规说明与致谢。`,
  alternates: { canonical: "/opensource" },
};

export default async function OpenSourcePage() {
  const page = getPage("opensource");
  if (!page) notFound();

  const { html } = await renderMarkdown(page.content);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8">
      <div className="rounded-2xl border border-border/60 bg-background/75 p-5 backdrop-blur-md sm:p-10">
        <h1 className="border-b border-border/60 pb-4 font-heading text-[27px] font-semibold tracking-[-0.3px] sm:text-[34px]">
          {page.title}
        </h1>
        <div className="reading-doc mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
