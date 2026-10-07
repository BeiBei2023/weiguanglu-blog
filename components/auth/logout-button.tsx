"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={
        className ??
        "text-sm text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
      }
    >
      {pending ? "退出中…" : "退出"}
    </button>
  );
}
