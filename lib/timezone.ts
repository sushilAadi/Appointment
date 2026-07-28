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
