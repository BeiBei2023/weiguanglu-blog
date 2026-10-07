import { notFound } from "next/navigation";
import { getPage } from "@/lib/content/pages";
import { renderMarkdown } from "@/lib/markdown/render";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "隐私政策",
  description: `隐私政策：说明${site.name}收集哪些信息、如何使用，涉及评论（giscus/GitHub）等第三方服务，以及数据保留与你的权利。`,
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const page = getPage("privacy");
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
