import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { listAppointments, type Appointment } from "@/lib/db/appointments";
import { CLINIC_TIMEZONE, CLINIC_UTC_OFFSET_MINUTES } from "@/lib/config";
import { isoDateInClinicTz } from "@/lib/timezone";
import { initialsFor } from "@/lib/format";
import MiniCalendar from "@/components/MiniCalendar";
import PrescriptionTrigger from "@/components/PrescriptionTrigger";
import BookAppointmentModal from "@/components/BookAppointmentModal";
import { getUpcomingWorkingDays } from "@/lib/availability";
import {
  RANGE_START_MIN,
  RANGE_END_MIN,
  addDays,
  weekStartOf,
  weekdayLabel,
  dayOfMonth,
  layoutDay,
  buildMonthGrid,
  monthLabel,
  addMonths,
  currentTimeInfo,
  isHappeningNow,
  clinicLocalMidnightFromIso,
  datesBetween,
  orderRange,
  rangeLabel,
} from "@/lib/weekCalendar";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIMEZONE });
const visitDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: CLINIC_TIMEZONE,
});

const STATUS_CLASS: Record<Appointment["status"], string> = {
  CONFIRMED: "appt-block--confirmed",
  COMPLETED: "appt-block--completed",
  CANCELLED: "appt-block--cancelled",
};

const STATUS_BADGE: Record<Appointment["status"], string> = {
  CONFIRMED: "badge-confirmed",
  COMPLETED: "badge-completed",
  CANCELLED: "badge-cancelled",
};

/** GMT offset label for the time-column header, e.g. "GMT+5:30" — real,
 * derived from config, not a hardcoded demo value. */
function gmtLabel(): string {
  const sign = CLINIC_UTC_OFFSET_MINUTES >= 0 ? "+" : "-";
  const abs = Math.abs(CLINIC_UTC_OFFSET_MINUTES);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** Hour tick labels down the left edge of the grid — every hour across the
 * clinic's real working hours (config.ts), not a fixed 24-hour range, since
 * every real appointment falls inside that window anyway. */
function hourLabels(): { label: string; topPct: number }[] {
  const labels: { label: string; topPct: number }[] = [];
  const totalMin = RANGE_END_MIN - RANGE_START_MIN;
  for (let min = RANGE_START_MIN; min <= RANGE_END_MIN; min += 60) {
    const hour24 = Math.floor(min / 60);
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    labels.push({ label: `${hour12} ${hour24 < 12 ? "AM" : "PM"}`, topPct: ((min - RANGE_START_MIN) / totalMin) * 100 });
  }
  return labels;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>;
}) {
  const resolved = await searchParams;
  const now = new Date();
  const todayIso = isoDateInClinicTz(now);

  // A custom range needs both ends to be valid ISO dates; anything else
  // (first visit, "Today" reset, a malformed/partial URL) falls back to the
  // default Monday-start week containing today.
  let rangeDates: string[];
  if (resolved.from && resolved.to && ISO_RE.test(resolved.from) && ISO_RE.test(resolved.to)) {
    const [from, to] = orderRange(resolved.from, resolved.to);
    rangeDates = datesBetween(from, to);
  } else {
    const weekStartIso = weekStartOf(todayIso);
    rangeDates = Array.from({ length: 7 }, (_, i) => addDays(weekStartIso, i));
  }
  const rangeLength = rangeDates.length;
  const rangeStartIso = rangeDates[0];
  const rangeEndIso = rangeDates[rangeLength - 1];

  const rangeStart = clinicLocalMidnightFromIso(rangeStartIso);
  const rangeEnd = clinicLocalMidnightFromIso(addDays(rangeEndIso, 1));

  const rangeAppointments = await listAppointments({
    startFrom: rangeStart,
    startBefore: rangeEnd,
    limit: 500,
    orderAscending: true,
  });

  const byDay = new Map<string, Appointment[]>();
  for (const a of rangeAppointments) {
    const key = isoDateInClinicTz(a.startTime);
    const list = byDay.get(key) ?? [];
    list.push(a);
    byDay.set(key, list);
  }

  const todaysAppointments = (byDay.get(todayIso) ?? [])
    .slice()
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const monthKey = resolved.month && /^\d{4}-\d{2}$/.test(resolved.month) ? resolved.month : rangeStartIso.slice(0, 7);
  const monthWeeks = buildMonthGrid(monthKey);

  // Month nav (‹ July › on the mini calendar) preserves whatever range is
  // currently on screen — only the month being *browsed* changes.
  const prevMonthKey = addMonths(monthKey, -1);
  const nextMonthKey = addMonths(monthKey, 1);
  const prevMonthHref = `/schedule?from=${rangeStartIso}&to=${rangeEndIso}&month=${prevMonthKey}`;
  const nextMonthHref = `/schedule?from=${rangeStartIso}&to=${rangeEndIso}&month=${nextMonthKey}`;

  // Prev/next range nav shifts by the *current* range's own length, so a
  // custom 2-day pick pages two days at a time instead of snapping back to
  // a fixed week.
  const prevRangeStartIso = addDays(rangeStartIso, -rangeLength);
  const nextRangeStartIso = addDays(rangeStartIso, rangeLength);
  const prevRangeHref = `/schedule?from=${prevRangeStartIso}&to=${addDays(prevRangeStartIso, rangeLength - 1)}`;
  const nextRangeHref = `/schedule?from=${nextRangeStartIso}&to=${addDays(nextRangeStartIso, rangeLength - 1)}`;

  const hours = hourLabels();
  const todayColumnIndex = rangeDates.indexOf(todayIso);
  const nowInfo = todayColumnIndex !== -1 ? currentTimeInfo(now) : null;
  const upcomingDays = getUpcomingWorkingDays();

  return (
    <>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Calendar</p>
          <h1 className="page-title">Appointment</h1>
        </div>
        <div className="page-header-actions">
          <BookAppointmentModal upcomingDays={upcomingDays} />
          <a className="btn-primary" href="/api/export/appointments">
            <Download size={15} /> Export CSV
          </a>
        </div>
      </div>

      <div className="appt-shell">
        <div className="appt-sidebar">
          <MiniCalendar
            monthLabel={monthLabel(monthKey)}
            weeks={monthWeeks}
            todayIso={todayIso}
            rangeDates={rangeDates}
            prevMonthHref={prevMonthHref}
            nextMonthHref={nextMonthHref}
          />
          <hr className="appt-sidebar-divider" />
          <div className="appt-sidebar-widget appt-sidebar-widget--list">
            <div className="panel-header">
              <h2>Today&apos;s appointments</h2>
            </div>
            {todaysAppointments.length === 0 ? (
              <p className="empty-state">Nothing booked for today.</p>
            ) : (
              <div className="today-appt-list">
                {todaysAppointments.map((a) => (
                  <div className={`today-appt-card today-appt-card--${a.status.toLowerCase()}`} key={a.id}>
                    <span className="avatar">{initialsFor(a.clientName)}</span>
                    <div className="today-appt-info">
                      <p className="today-appt-name">{a.clientName}</p>
                      <div className="today-appt-meta">
                        <span className="today-appt-time">
                          {timeFmt.format(a.startTime)} – {timeFmt.format(a.endTime)}
                        </span>
                        <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status.toLowerCase()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="appt-main">
          <div className="appt-main-header">
            <div className="appt-main-header-left">
              <h2>{rangeLabel(rangeDates)}</h2>
              <div className="week-nav-pill">
                <a href="/schedule">Today</a>
                <span className="week-nav-divider" />
                <a href={prevRangeHref} aria-label="Previous range">
                  <ChevronLeft size={15} />
                </a>
                <a href={nextRangeHref} aria-label="Next range">
                  <ChevronRight size={15} />
                </a>
              </div>
            </div>
            <div className="appt-legend">
              <span>
                <i className="legend-dot confirmed" /> Confirmed
              </span>
              <span>
                <i className="legend-dot completed" /> Completed
              </span>
              <span>
                <i className="legend-dot cancelled" /> Cancelled
              </span>
            </div>
          </div>

          <div className="appt-grid-wrap">
            <div className="appt-day-headers">
              <span className="appt-time-col-label">{gmtLabel()}</span>
              {rangeDates.map((iso) => (
                <div key={iso} className={`appt-day-header${iso === todayIso ? " appt-day-header--today" : ""}`}>
                  {weekdayLabel(iso).toUpperCase()} {dayOfMonth(iso)}
                </div>
              ))}
            </div>

            <div className="appt-grid-body">
              <div className="appt-time-col">
                {hours.map((h) => (
                  <span key={h.label} className="appt-time-label" style={{ top: `${h.topPct}%` }}>
                    {h.label}
                  </span>
                ))}
              </div>
              <div className="appt-columns" style={{ gridTemplateColumns: `repeat(${rangeLength}, 1fr)` }}>
                {rangeDates.map((iso) => (
                  <div className="appt-column-bg" key={iso}>
                    {hours.map((h) => (
                      <span key={h.label} className="appt-gridline" style={{ top: `${h.topPct}%` }} />
                    ))}
                  </div>
                ))}

                {nowInfo && (
                  <div className="appt-now-line" style={{ top: `${nowInfo.topPct}%` }}>
                    <span
                      className="appt-now-badge"
                      style={{ left: `${(todayColumnIndex / rangeLength) * 100}%` }}
                    >
                      {nowInfo.label}
                    </span>
                  </div>
                )}

                {rangeDates.map((iso, dayIndex) =>
                  layoutDay(byDay.get(iso) ?? []).map(({ appointment, topPct, heightPct, lane, laneCount }) => {
                    const startHour = appointment.startTime.getHours();
                    const tooltipPositionClass = startHour < 14 ? "appt-tooltip--below" : "appt-tooltip--above";
                    const blockClassName = `appt-block ${STATUS_CLASS[appointment.status]}${
                      isHappeningNow(appointment, now) ? " appt-block--now" : ""
                    }`;
                    const blockStyle = {
                      top: `${topPct}%`,
                      height: `${heightPct}%`,
                      left: `${((dayIndex + lane / laneCount) / rangeLength) * 100}%`,
                      width: `${100 / rangeLength / laneCount}%`,
                    };
                    const blockContent = (
                      <>
                        <div className="appt-block-content">
                          <span className="appt-block-name">{appointment.clientName}</span>
                          <span className="appt-block-time">
                            {timeFmt.format(appointment.startTime)}–{timeFmt.format(appointment.endTime)}
                          </span>
                        </div>

                        <div className={`appt-block-hover-card ${tooltipPositionClass}`}>
                          <div className="appt-hover-name">{appointment.clientName}</div>
                          <div className="appt-hover-time">
                            {timeFmt.format(appointment.startTime)} – {timeFmt.format(appointment.endTime)}
                          </div>
                          <div className="appt-hover-detail">
                            <span>Phone:</span>
                            <span>+{appointment.clientPhone}</span>
                          </div>
                          <div className="appt-hover-detail">
                            <span>Status:</span>
                            <span className={`appt-hover-status ${appointment.status.toLowerCase()}`}>
                              {appointment.status.toLowerCase()}
                            </span>
                          </div>
                          {appointment.notes && (
                            <div className="appt-hover-detail appt-hover-notes">
                              <span>Notes:</span>
                              <span className="appt-hover-notes-content">{appointment.notes}</span>
                            </div>
                          )}
                          {appointment.status === "COMPLETED" && (
                            <div className="appt-hover-detail appt-hover-rx-hint">Click to view prescription →</div>
                          )}
                        </div>
                      </>
                    );

                    // Completed visits render as a real button so clicking
                    // opens the prescription preview; confirmed/cancelled
                    // blocks stay a plain (non-interactive) div — same look
                    // either way via shared .appt-block CSS.
                    if (appointment.status === "COMPLETED") {
                      return (
                        <PrescriptionTrigger
                          key={appointment.id}
                          className={blockClassName}
                          style={blockStyle}
                          clientName={appointment.clientName}
                          clientPhone={appointment.clientPhone}
                          visitLabel={`${visitDateFmt.format(appointment.startTime)}, ${timeFmt.format(
                            appointment.startTime
                          )}–${timeFmt.format(appointment.endTime)}`}
                          notes={appointment.prescriptionNotes}
                          photoUrl={appointment.prescriptionPhotoUrl}
                          slipUrl={appointment.prescriptionSlipUrl}
                        >
                          {blockContent}
                        </PrescriptionTrigger>
                      );
                    }

                    return (
                      <div key={appointment.id} className={blockClassName} style={blockStyle}>
                        {blockContent}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
