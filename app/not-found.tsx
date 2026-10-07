import Link from "next/link";
import { Compass } from "lucide-react";

export const metadata = { title: "页面不存在" };

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-20">
      <div className="rounded-2xl border border-border/60 bg-background/75 p-8 text-center backdrop-blur-md sm:p-12">
        <p className="font-heading text-[64px] font-semibold leading-none tracking-[-2px] tabular-nums text-muted-foreground/40">
          404
        </p>
        <h1 className="mt-5 font-heading text-[24px] font-semibold tracking-[-0.3px]">
          这一页不存在
        </h1>
        <p className="mx-auto mt-2.5 max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">
          链接可能过期了，或者这条内容后来改了名字。可以回首页看看最近的更新，或者去归档、标签里翻。
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Compass className="h-3.5 w-3.5" />
            回首页
          </Link>
          <Link
            href="/archive"
            className="inline-flex items-center rounded-full border border-border/70 px-4 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            全部档案
          </Link>
          <Link
            href="/tags"
            className="inline-flex items-center rounded-full border border-border/70 px-4 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            按标签找
          </Link>
        </div>
      </div>
    </div>
  );
}
