import Link from "next/link";

function pageHref(basePath: string, page: number): string {
  if (page <= 1) return basePath;
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}page=${page}`;
}

function buildWindow(current: number, total: number): (number | "gap")[] {
  const set = new Set<number>([1, total]);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p > 1 && p < total) set.add(p);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

export function Pagination({
  basePath,
  current,
  total,
}: {
  basePath: string;
  current: number;
  total: number;
}) {
  if (total <= 1) return null;

  const pages = buildWindow(current, total);
  const linkClass =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-muted-foreground transition-colors hover:text-primary";
  const disabledClass = "inline-flex h-8 items-center justify-center px-2 text-muted-foreground/40";

  return (
    <nav aria-label="分页" className="mt-10 flex flex-wrap items-center justify-center gap-1 text-sm">
      {current > 1 ? (
        <Link href={pageHref(basePath, current - 1)} className={`px-2 ${linkClass}`}>
          ← 上一页
        </Link>
      ) : (
        <span className={disabledClass}>← 上一页</span>
      )}

      {pages.map((p, index) =>
        p === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(basePath, p)}
            aria-current={p === current ? "page" : undefined}
            className={
              p === current
                ? "inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-2 font-medium text-primary-foreground"
                : linkClass
            }
          >
            {p}
          </Link>
        ),
      )}

      {current < total ? (
        <Link href={pageHref(basePath, current + 1)} className={`px-2 ${linkClass}`}>
          下一页 →
        </Link>
      ) : (
        <span className={disabledClass}>下一页 →</span>
      )}
    </nav>
  );
}
