import { notFound } from "next/navigation";
import { getPage } from "@/lib/content/pages";
import { renderMarkdown } from "@/lib/markdown/render";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "免责声明",
  description: `免责声明：${site.name}内容按「现状」提供、不构成专业建议，说明合法合规使用、第三方平台、软硬件安全与责任限制。`,
  alternates: { canonical: "/disclaimer" },
};

export default async function DisclaimerPage() {
  const page = getPage("disclaimer");
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
