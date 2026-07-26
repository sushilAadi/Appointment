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
