// Central place for all tunable business rules. Edit these to match the
// doctor's real working hours / appointment length without touching the
// booking logic itself.

// The clinic's real-world timezone. Deployed apps run on servers set to
// UTC (Vercel included) — without this, "9 AM" working hours would mean
// 9 AM UTC (2:30 PM IST), not 9 AM where the clinic actually is. All
// availability math and displayed times are anchored to this zone.
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

// Fixed UTC offset in minutes for CLINIC_TIMEZONE, used to compute day/
// working-hour boundaries. IST (Asia/Kolkata) is UTC+5:30 year-round with
// no daylight saving, so a fixed number is safe here. If you change
// CLINIC_TIMEZONE to a zone that observes DST, this needs to become
// DST-aware (e.g. via a library like date-fns-tz) — a fixed offset alone
// would drift by an hour part of the year.
export const CLINIC_UTC_OFFSET_MINUTES = Number(process.env.CLINIC_UTC_OFFSET_MINUTES ?? 330);

export const WORKING_HOURS = {
  // 24-hour clock, in CLINIC_TIMEZONE.
  startHour: 9,
  endHour: 17,
  // 0 = Sunday ... 6 = Saturday. Default: closed Sunday (0) and Saturday (6).
  closedDays: [0, 6] as number[],
};

export const SLOT_MINUTES = 30;
export const BOOKING_WINDOW_DAYS = 7;
export const MAX_SLOTS_SHOWN = 10;

export const DOCTOR_NAME = process.env.DOCTOR_NAME || "the doctor";
export const CLINIC_NAME = process.env.CLINIC_NAME || "the clinic";

// Normalize to digits only so comparisons with WhatsApp's "from" field
// (which arrives as digits with no "+") are reliable.
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const DOCTOR_WHATSAPP_NUMBER = normalizePhone(
  process.env.DOCTOR_WHATSAPP_NUMBER || ""
);

export function isDoctor(phone: string): boolean {
  return normalizePhone(phone) === DOCTOR_WHATSAPP_NUMBER;
}
