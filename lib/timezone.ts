import { CLINIC_UTC_OFFSET_MINUTES } from "./config";

// The server this runs on (Vercel included) uses UTC, not the clinic's
// local time. These helpers shift a Date by the clinic's fixed UTC offset
// so callers can read/set "wall clock" fields (hours, day-of-week, etc.) as
// they'd appear in the clinic's timezone, then shift back to get a real UTC
// instant. See CLINIC_UTC_OFFSET_MINUTES in config.ts for the DST caveat.
export function toClinicLocal(date: Date): Date {
  return new Date(date.getTime() + CLINIC_UTC_OFFSET_MINUTES * 60_000);
}

export function fromClinicLocal(localDate: Date): Date {
  return new Date(localDate.getTime() - CLINIC_UTC_OFFSET_MINUTES * 60_000);
}

/** Midnight (start of day) in the clinic's timezone, `daysFromNow` days out, returned as a real UTC instant. */
export function clinicMidnight(daysFromNow = 0): Date {
  const clinicNow = toClinicLocal(new Date());
  const localMidnight = new Date(
    Date.UTC(clinicNow.getUTCFullYear(), clinicNow.getUTCMonth(), clinicNow.getUTCDate() + daysFromNow)
  );
  return fromClinicLocal(localMidnight);
}

/**
 * Start and end (as real UTC instants) of the clinic-local calendar day that
 * contains `date`. Used to detect "already booked that day" — e.g. a patient
 * picking a second slot on the same date as an existing confirmed booking.
 */
export function clinicDayRange(date: Date): { start: Date; end: Date } {
  const local = toClinicLocal(date);
  const localMidnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const start = fromClinicLocal(localMidnight);
  const end = fromClinicLocal(new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000));
  return { start, end };
}

/**
 * The clinic-local calendar date of `date`, as a "YYYY-MM-DD" key — used as
 * a stable, no-spaces id for date pickers (WhatsApp list/button ids can't
 * contain spaces) and as a lookup key grouping slots by day.
 */
export function isoDateInClinicTz(date: Date): string {
  const local = toClinicLocal(date);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Midnight (as a real UTC instant) of a "YYYY-MM-DD" clinic-local calendar date. */
export function clinicLocalMidnightFromIso(dateIso: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const localMidnight = new Date(Date.UTC(y, m - 1, d));
  return fromClinicLocal(localMidnight);
}

/** Start and end (as real UTC instants) of the clinic-local calendar day identified by `dateIso`. */
export function clinicDateRangeFromIso(dateIso: string): { start: Date; end: Date } {
  const start = clinicLocalMidnightFromIso(dateIso);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** A specific wall-clock time (hour/minute, clinic-local) on the calendar date `dateIso`, as a real UTC instant. */
export function clinicLocalTimeFromIso(dateIso: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0));
  return fromClinicLocal(local);
}
