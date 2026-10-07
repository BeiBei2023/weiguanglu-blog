import Link from "next/link";
import { getTagCounts } from "@/lib/content";
import { WidgetHeading } from "./widget-heading";

const SIZES = ["text-xs", "text-sm", "text-base", "text-lg"];

export function TagCloudWidget() {
  const tags = getTagCounts();
  if (tags.length === 0) return null;

  const counts = tags.map((t) => t.count);
  const max = Math.max(...counts);
  const min = Math.min(...counts);

  return (
    <section aria-label="标签云">
      <WidgetHeading>标签云</WidgetHeading>
      <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        {tags.map(({ tag, count }) => {
          const ratio = max === min ? 1 : (count - min) / (max - min);
          const size = SIZES[Math.min(SIZES.length - 1, Math.round(ratio * (SIZES.length - 1)))];
          return (
            <li key={tag}>
              <Link
                href={`/tags/${encodeURIComponent(tag)}`}
                className={`${size} text-muted-foreground transition-colors hover:text-tag`}
              >
                {tag}
                <span className="ml-1 align-super text-[10px] tabular-nums">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
