import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getServerSession } from "@/lib/auth/server";

export const metadata = { title: "登录" };

function safeNext(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/admin";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getServerSession();
  const { next } = await searchParams;
  const target = safeNext(next);

  if (session) redirect(target);

  return (
    <div className="mx-auto w-full max-w-[380px] px-4 py-20">
      <div className="rounded-2xl border border-border/60 bg-background/75 p-8 backdrop-blur-md">
        <h1 className="font-heading text-[24px] font-semibold tracking-[-0.3px]">登录</h1>
        <p className="mt-1 text-sm text-muted-foreground">博客 · 私有区域</p>
        <LoginForm next={target} />
      </div>
    </div>
  );
}
