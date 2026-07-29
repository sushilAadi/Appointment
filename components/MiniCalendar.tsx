"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayOfMonth, orderRange, type MonthGridWeek } from "@/lib/weekCalendar";

const WEEKDAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];

interface MiniCalendarProps {
  monthLabel: string;
  weeks: MonthGridWeek[];
  todayIso: string;
  /** Every date currently shown in the main grid — highlighted so the mini
   * calendar always reflects what's on screen, whether that's the default
   * week or a custom picked range. */
  rangeDates: string[];
  prevMonthHref: string;
  nextMonthHref: string;
}

/**
 * Interactive month picker: click a day to arm it as the range start, click
 * a second day to complete the range and navigate to
 * `/schedule?from=...&to=...` showing exactly those days in the main grid.
 * Clicking the same day twice selects just that single day.
 */
export default function MiniCalendar({
  monthLabel,
  weeks,
  todayIso,
  rangeDates,
  prevMonthHref,
  nextMonthHref,
}: MiniCalendarProps) {
  const router = useRouter();
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const rangeSet = new Set(rangeDates);

  function handleDayClick(iso: string) {
    if (!pendingStart) {
      setPendingStart(iso);
      return;
    }
    const [from, to] = orderRange(pendingStart, iso);
    setPendingStart(null);
    router.push(`/schedule?from=${from}&to=${to}`);
  }

  return (
    <div className="appt-sidebar-widget">
      <div className="mini-cal-header">
        <h2>{monthLabel}</h2>
        <div className="mini-cal-nav">
          <a className="icon-btn" href={prevMonthHref} aria-label="Previous month">
            <ChevronLeft size={14} />
          </a>
          <a className="icon-btn" href={nextMonthHref} aria-label="Next month">
            <ChevronRight size={14} />
          </a>
        </div>
      </div>
      <div className="mini-cal-weekdays">
        {WEEKDAY_HEADS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mini-cal-grid">
        {weeks.map((week, wi) =>
          week.days.map((iso, di) => {
            if (!iso) return <span key={`${wi}-${di}`} className="mini-cal-day mini-cal-day--empty" />;
            const isToday = iso === todayIso;
            const isPending = iso === pendingStart;
            const inRange = rangeSet.has(iso);
            const classes = ["mini-cal-day"];
            if (isToday) classes.push("mini-cal-day--today");
            else if (isPending) classes.push("mini-cal-day--pending-start");
            else if (inRange) classes.push("mini-cal-day--in-week");
            return (
              <button
                key={iso}
                type="button"
                className={classes.join(" ")}
                onClick={() => handleDayClick(iso)}
                aria-label={
                  pendingStart ? `End range on ${iso}` : `Start a custom range on ${iso}`
                }
              >
                {dayOfMonth(iso)}
              </button>
            );
          })
        )}
      </div>
      {pendingStart && <p className="mini-cal-hint">Pick an end date…</p>}
    </div>
  );
}
