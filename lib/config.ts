// Central place for all tunable business rules. Edit these to match the
// doctor's real working hours / appointment length without touching the
// booking logic itself.

export const WORKING_HOURS = {
  // 24-hour clock, local server time.
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
