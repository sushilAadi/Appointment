// Pure date/layout math for the week-grid Schedule page — kept separate
// from the page component so the (fiddly) lane-assignment and percentage
// math can be reasoned about on its own.
import type { Appointment } from "./db/appointments";
import { WORKING_HOURS } from "./config";
import { toClinicLocal, clinicLocalMidnightFromIso } from "./timezone";

export const RANGE_START_MIN = WORKING_HOURS.startHour * 60;
export const RANGE_END_MIN = WORKING_HOURS.endHour * 60;
const RANGE_MIN = RANGE_END_MIN - RANGE_START_MIN;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function minutesOfDay(date: Date): number {
  const local = toClinicLocal(date);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** "YYYY-MM-DD" -> Date at UTC midnight, purely for calendar-math (adding
 * days, reading weekday) — never used to derive a real appointment instant. */
function isoToUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function utcDateToIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const d = isoToUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateToIso(d);
}

/** Monday of the week containing `iso` (Mon..Sun week, matching the mini
 * calendar and the rest of the app's WEEKDAY_LABELS convention). */
export function weekStartOf(iso: string): string {
  const weekday = isoToUtcDate(iso).getUTCDay(); // 0=Sun..6=Sat
  const offsetFromMonday = (weekday + 6) % 7; // Mon=0..Sun=6
  return addDays(iso, -offsetFromMonday);
}

export function weekdayLabel(iso: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][isoToUtcDate(iso).getUTCDay()];
}

export function dayOfMonth(iso: string): number {
  return isoToUtcDate(iso).getUTCDate();
}

/** Inclusive list of "YYYY-MM-DD" dates from `fromIso` to `toIso` — the
 * custom range the mini calendar's two-click picker produces. Callers are
 * expected to have already ordered from <= to (see `orderRange`). */
export function datesBetween(fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  let cursor = fromIso;
  // A generous cap, not a real limit — guards against a malformed/huge
  // range (e.g. a hand-edited URL) turning into an unbounded loop.
  for (let i = 0; i < 366 && cursor <= toIso; i++) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** Puts two arbitrarily-ordered ISO dates (from a 2-click range pick,
 * where the user might click the later day first) into [start, end] order. */
export function orderRange(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

const rangeDayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Human label for the currently-displayed range, e.g. "Jul 27 – Aug 2" or
 * just "Jul 29" for a single selected day — generalizes to any length,
 * unlike a bare month name which breaks once a custom range spans or sits
 * outside a single month. */
export function rangeLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const first = rangeDayFmt.format(isoToUtcDate(dates[0]));
  if (dates.length === 1) return first;
  const last = rangeDayFmt.format(isoToUtcDate(dates[dates.length - 1]));
  return `${first} – ${last}`;
}

export interface PositionedAppointment {
  appointment: Appointment;
  topPct: number;
  heightPct: number;
  lane: number;
  laneCount: number;
}

/** Greedy interval-scheduling lane assignment — appointments that overlap in
 * time on the same day get placed in side-by-side lanes instead of stacking
 * on top of each other. Normally there's at most one CONFIRMED appointment
 * per slot (enforced by a DB unique index), but a cancelled/completed
 * historical row can still share a slot with a later confirmed booking. */
export function layoutDay(appointments: Appointment[]): PositionedAppointment[] {
  const sorted = [...appointments].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const laneEndMinutes: number[] = [];
  const withLane: { appointment: Appointment; lane: number }[] = [];

  for (const appointment of sorted) {
    const startMin = minutesOfDay(appointment.startTime);
    const endMin = minutesOfDay(appointment.endTime);
    let lane = laneEndMinutes.findIndex((end) => startMin >= end);
    if (lane === -1) lane = laneEndMinutes.length;
    laneEndMinutes[lane] = endMin;
    withLane.push({ appointment, lane });
  }

  const laneCount = Math.max(1, laneEndMinutes.length);
  return withLane.map(({ appointment, lane }) => {
    const startMin = clamp(minutesOfDay(appointment.startTime), RANGE_START_MIN, RANGE_END_MIN);
    const endMin = clamp(minutesOfDay(appointment.endTime), RANGE_START_MIN, RANGE_END_MIN);
    const topPct = ((startMin - RANGE_START_MIN) / RANGE_MIN) * 100;
    const heightPct = Math.max(3, ((endMin - startMin) / RANGE_MIN) * 100);
    return { appointment, topPct, heightPct, lane, laneCount };
  });
}

export interface MonthGridWeek {
  days: (string | null)[]; // 7 entries, Mon..Sun; null = padding outside the month
}

/** Mon-start month grid for the mini calendar — `monthKey` is "YYYY-MM". */
export function buildMonthGrid(monthKey: string): MonthGridWeek[] {
  const [y, m] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = firstOfMonth.getUTCDay(); // 0=Sun..6=Sat
  const leadingBlanks = (firstWeekday + 6) % 7; // Mon=0

  const cells: (string | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: MonthGridWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({ days: cells.slice(i, i + 7) });
  }
  return weeks;
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

export function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Real "now" line position — only meaningful while the current moment
 * falls inside the clinic's working hours. Used to draw the dashed
 * current-time indicator across the grid, same idea as Google
 * Calendar/reference design, but driven off the actual clock rather than a
 * hardcoded demo position. */
export function currentTimeInfo(now: Date): { topPct: number; label: string } | null {
  const min = minutesOfDay(now);
  if (min < RANGE_START_MIN || min > RANGE_END_MIN) return null;
  const topPct = ((min - RANGE_START_MIN) / RANGE_MIN) * 100;
  const hour24 = Math.floor(min / 60);
  const minute = min % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const label = `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
  return { topPct, label };
}

/** Whether an appointment is happening right now (confirmed and the
 * current instant falls inside its start/end range) — used to give the
 * "in progress" block extra visual weight, mirroring the reference design's
 * solid-highlighted block, without inventing any data. */
export function isHappeningNow(appointment: Appointment, now: Date): boolean {
  return appointment.status === "CONFIRMED" && now >= appointment.startTime && now < appointment.endTime;
}

export { clinicLocalMidnightFromIso };
