import type { ReactNode } from "react";

export function WidgetHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-heading text-xs font-semibold tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}
