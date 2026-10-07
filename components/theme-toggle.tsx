"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="切换主题"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-primary"
    >
      <Sun className="hidden h-4 w-4 transition-transform duration-300 dark:block" />
      <Moon className="block h-4 w-4 transition-transform duration-300 dark:hidden" />
    </button>
  );
}
