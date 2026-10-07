"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { WidgetHeading } from "./widget-heading";
import "react-day-picker/style.css";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function keyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthOf(dayKey: string): Date {
  const [y, m] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** "YYYY-MM" / "YYYY-MM-DD" → 该月 1 号；只有年份或非法则返回 null */
function monthFromIso(iso?: string): Date | null {
  if (!iso) return null;
  const [y, m] = iso.split("-").map(Number);
  if (!Number.isFinite(y)) return null;
  if (Number.isFinite(m) && m >= 1 && m <= 12) return new Date(y, m - 1, 1);
  return null;
}

/** 有文章的日期渲染成真链接（可中键新开 / 可被爬虫跟踪）；其余为禁用按钮 */
function CalendarDayButton({
  day,
  modifiers,
  className,
  children,
  disabled,
}: DayButtonProps & { children?: ReactNode }) {
  const key = keyOf(day.date);
  if (modifiers.hasPost && !disabled) {
    return (
      <Link
        href={`/archive/${key.split("-").join("/")}`}
        className={className}
        aria-label={`${key} 的文章`}
      >
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} disabled aria-disabled="true">
      {children}
    </button>
  );
}

export function CalendarWidget({
  dates,
  initialMonth,
}: {
  dates?: Record<string, number>;
  /** 归档页传入正在浏览的年月，避免点日期后跳回最新月 */
  initialMonth?: string;
}) {
  const counts = useMemo(() => dates ?? {}, [dates]);
  const keys = useMemo(() => Object.keys(counts).sort(), [counts]);
  const todayMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const bounds = useMemo(() => {
    if (keys.length === 0) return { start: todayMonth, end: todayMonth, latest: todayMonth };
    return {
      start: monthOf(keys[0]),
      end: monthOf(keys[keys.length - 1]),
      latest: monthOf(keys[keys.length - 1]),
    };
  }, [keys, todayMonth]);

  const [month, setMonth] = useState<Date>(() => monthFromIso(initialMonth) ?? bounds.latest);

  // 允许翻到「今天」所在月（即使该月还没有文章）
  const rangeStart = bounds.start < todayMonth ? bounds.start : todayMonth;
  const rangeEnd = bounds.end > todayMonth ? bounds.end : todayMonth;

  const hasPost = (date: Date) => (counts[keyOf(date)] ?? 0) > 0;

  return (
    <section aria-label="日历" className="wgl-calendar text-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <WidgetHeading>
          <CalendarDays className="mr-1.5 inline-block h-3.5 w-3.5" />
          日历
        </WidgetHeading>
        <button
          type="button"
          onClick={() => setMonth(todayMonth)}
          className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
        >
          今天
        </button>
      </div>
      <DayPicker
        mode="single"
        month={month}
        onMonthChange={setMonth}
        defaultMonth={bounds.latest}
        startMonth={rangeStart}
        endMonth={rangeEnd}
        showOutsideDays={false}
        weekStartsOn={0}
        locale={zhCN}
        aria-label="日历"
        modifiers={{ hasPost }}
        modifiersClassNames={{ hasPost: "wgl-haspost" }}
        disabled={(date) => !hasPost(date)}
        components={{ DayButton: CalendarDayButton }}
      />
    </section>
  );
}
