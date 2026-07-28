import { listAppointments } from "./db/appointments";
import { listDoctorBlocks } from "./db/doctorBlocks";
import { getBusyIntervals } from "./calendar";
import {
  BOOKING_WINDOW_DAYS,
  CLINIC_TIMEZONE,
  MAX_SLOTS_SHOWN,
  MAX_TOTAL_SLOTS_SHOWN,
  SLOT_MINUTES,
  WORKING_HOURS,
} from "./config";
import {
  toClinicLocal,
  fromClinicLocal,
  isoDateInClinicTz,
  clinicDateRangeFromIso,
  clinicLocalTimeFromIso,
} from "./timezone";

export interface Slot {
  start: Date;
  end: Date;
}

// Why a slot is unavailable — only a real patient appointment should ever be
// labeled "Booked"; a doctor block or a Google Calendar event is the
// doctor's own unavailability, not something a patient booked, so it gets a
// "Not available" label instead (see buildSlotListMessage).
export type BusySource = "appointment" | "block" | "calendar";

export interface SlotWithAvailability extends Slot {
  available: boolean;
  busySource?: BusySource | null;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Builds the full working-hours grid over the next BOOKING_WINDOW_DAYS,
 * marking each slot available/unavailable based on CONFIRMED appointments
 * in the database, doctor-defined "block my time" windows, and busy blocks
 * on the Google Calendar (covers events created outside the bot, e.g. the
 * doctor blocking time off manually in Calendar instead of via WhatsApp).
 *
 * Keeps generating days until either `limitAvailable` available slots have
 * been collected, or `limitTotal` total slots (available + booked) have
 * been generated — the second cap exists so a fully-booked week doesn't
 * produce a huge WhatsApp message. Callers that need the true full picture
 * (e.g. the per-day availability summary) can pass very high caps.
 */
export async function getSlotsWithAvailability(
  options: { limitAvailable?: number; limitTotal?: number } = {}
): Promise<SlotWithAvailability[]> {
  const { limitAvailable = MAX_SLOTS_SHOWN, limitTotal = MAX_TOTAL_SLOTS_SHOWN } = options;
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + BOOKING_WINDOW_DAYS);

  const [dbAppointments, calendarBusy, doctorBlocks] = await Promise.all([
    listAppointments({ status: "CONFIRMED", startFrom: now, startBefore: windowEnd }),
    getBusyIntervals(now, windowEnd).catch((err) => {
      // Don't let a Calendar API hiccup block booking entirely — fall back
      // to DB-only availability and log for visibility.
      console.error("getBusyIntervals failed, continuing without it", err);
      return [] as { start: Date; end: Date }[];
    }),
    listDoctorBlocks({ startFrom: now, startBefore: windowEnd }).catch((err) => {
      console.error("listDoctorBlocks failed, continuing without it", err);
      return [] as { startTime: Date; endTime: Date }[];
    }),
  ]);

  const busy: { start: Date; end: Date; source: BusySource }[] = [
    ...dbAppointments.map((a) => ({ start: a.startTime, end: a.endTime, source: "appointment" as const })),
    ...calendarBusy.map((b) => ({ ...b, source: "calendar" as const })),
    ...doctorBlocks.map((b) => ({ start: b.startTime, end: b.endTime, source: "block" as const })),
  ];

  const slots: SlotWithAvailability[] = [];
  let availableCount = 0;
  // "Today" in the clinic's timezone, not the server's.
  const clinicNow = toClinicLocal(now);

  for (
    let day = 0;
    day < BOOKING_WINDOW_DAYS && availableCount < limitAvailable && slots.length < limitTotal;
    day++
  ) {
    // Midnight of this day, expressed as clinic-local wall-clock fields
    // (read via the UTC getters on the shifted Date — see toClinicLocal).
    const localMidnight = new Date(
      Date.UTC(clinicNow.getUTCFullYear(), clinicNow.getUTCMonth(), clinicNow.getUTCDate() + day)
    );

    if (WORKING_HOURS.closedDays.includes(localMidnight.getUTCDay())) continue;

    const localDayStart = new Date(localMidnight);
    localDayStart.setUTCHours(WORKING_HOURS.startHour, 0, 0, 0);
    const localDayEnd = new Date(localMidnight);
    localDayEnd.setUTCHours(WORKING_HOURS.endHour, 0, 0, 0);

    // Convert the clinic-local boundaries back to real UTC instants for
    // comparison against `now` and stored appointment times.
    const dayStart = fromClinicLocal(localDayStart);
    const dayEnd = fromClinicLocal(localDayEnd);

    let slotStart = new Date(dayStart);

    while (
      slotStart < dayEnd &&
      availableCount < limitAvailable &&
      slots.length < limitTotal
    ) {
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
      if (slotEnd > dayEnd) break;

      // Only include slots that are still in the future — this is the
      // check that keeps past-time slots off the list for "today".
      if (slotStart > now) {
        const conflict = busy.find((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        slots.push({
          start: new Date(slotStart),
          end: new Date(slotEnd),
          available: !conflict,
          busySource: conflict?.source ?? null,
        });
        if (!conflict) availableCount++;
      }

      slotStart = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
    }
  }

  return slots;
}

/** Available slots only — used wherever booked slots don't need to be shown. */
export async function getAvailableSlots(limit = MAX_SLOTS_SHOWN): Promise<Slot[]> {
  const all = await getSlotsWithAvailability({ limitAvailable: limit });
  return all.filter((s) => s.available).map(({ start, end }) => ({ start, end }));
}

// A cap high enough that it never actually kicks in within a
// BOOKING_WINDOW_DAYS-sized window (max real slot count is roughly
// BOOKING_WINDOW_DAYS * slots-per-day, always far below this) — used when a
// caller needs the true, uncapped picture instead of a WhatsApp-message-sized one.
const UNCAPPED = Number.MAX_SAFE_INTEGER;

/**
 * One entry per upcoming day that still has at least one open slot, with a
 * count — this is what powers the "pick a date" step of booking. Only days
 * with real openings are included, so patients never tap into a fully-booked day.
 */
export async function getAvailableDates(): Promise<
  { dateIso: string; label: string; availableCount: number }[]
> {
  const slots = await getSlotsWithAvailability({ limitAvailable: UNCAPPED, limitTotal: UNCAPPED });
  const byDay = new Map<string, { dateIso: string; label: string; availableCount: number }>();

  for (const slot of slots) {
    if (!slot.available) continue;
    const dateIso = isoDateInClinicTz(slot.start);
    const entry = byDay.get(dateIso) ?? { dateIso, label: formatSlotDate(slot.start), availableCount: 0 };
    entry.availableCount++;
    byDay.set(dateIso, entry);
  }

  return [...byDay.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

/**
 * All slots (available + unavailable) on one specific clinic-local calendar
 * date — used once a patient has picked a day.
 *
 * Trimmed to at most `limitAvailable` available slots (default
 * MAX_SLOTS_SHOWN): WhatsApp's tappable list message hard-caps at 10 rows,
 * so numbering an 11th available slot in the text summary would show a
 * number that the tap list silently couldn't include — that mismatch is
 * exactly what caused an available time to go missing from "Choose a time"
 * while still appearing, numbered, in the text above it. Cutting the day's
 * slot list off right after the Nth available one keeps both views in sync
 * (at the cost of not showing any later-in-the-day "not available" gaps on
 * an unusually open day — an acceptable trade since Meta's cap can't be raised).
 */
export async function getSlotsForDate(
  dateIso: string,
  limitAvailable = MAX_SLOTS_SHOWN
): Promise<SlotWithAvailability[]> {
  const { start, end } = clinicDateRangeFromIso(dateIso);
  const slots = await getSlotsWithAvailability({ limitAvailable: UNCAPPED, limitTotal: UNCAPPED });
  const daySlots = slots.filter((s) => s.start >= start && s.start < end);

  const trimmed: SlotWithAvailability[] = [];
  let availableCount = 0;
  for (const slot of daySlots) {
    trimmed.push(slot);
    if (slot.available) {
      availableCount++;
      if (availableCount >= limitAvailable) break;
    }
  }
  return trimmed;
}

/**
 * Upcoming working days within the booking window, regardless of current
 * bookings — used by the doctor's "block my time" date picker, since a day
 * that's already fully booked (or fully open) is equally valid to block.
 * Purely calendar/working-hours math, no DB or Calendar calls.
 */
export function getUpcomingWorkingDays(): { dateIso: string; label: string }[] {
  const clinicNow = toClinicLocal(new Date());
  const days: { dateIso: string; label: string }[] = [];

  for (let day = 0; day < BOOKING_WINDOW_DAYS; day++) {
    const localMidnight = new Date(
      Date.UTC(clinicNow.getUTCFullYear(), clinicNow.getUTCMonth(), clinicNow.getUTCDate() + day)
    );
    if (WORKING_HOURS.closedDays.includes(localMidnight.getUTCDay())) continue;

    const dayStart = fromClinicLocal(localMidnight);
    days.push({ dateIso: isoDateInClinicTz(dayStart), label: formatSlotDate(dayStart) });
  }

  return days;
}

/** Working-hours start/end (as real UTC instants) for a given clinic-local calendar date. */
export function workingHoursForDate(dateIso: string): { start: Date; end: Date } {
  return {
    start: clinicLocalTimeFromIso(dateIso, WORKING_HOURS.startHour, 0),
    end: clinicLocalTimeFromIso(dateIso, WORKING_HOURS.endHour, 0),
  };
}

/** The midpoint of the working day (as a real UTC instant) for a given clinic-local calendar date — splits "morning" from "afternoon". */
export function midDayForDate(dateIso: string): Date {
  const totalMinutes = (WORKING_HOURS.endHour - WORKING_HOURS.startHour) * 60;
  const midMinutesFromStart = Math.floor(totalMinutes / 2);
  const midHour = WORKING_HOURS.startHour + Math.floor(midMinutesFromStart / 60);
  const midMinute = midMinutesFromStart % 60;
  return clinicLocalTimeFromIso(dateIso, midHour, midMinute);
}

export function formatSlotDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: CLINIC_TIMEZONE,
  }).format(date);
}

export function formatSlotTimeRange(slot: Slot): string {
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TIMEZONE,
  });
  return `${timeFmt.format(slot.start)}–${timeFmt.format(slot.end)}`;
}

export function formatSlot(slot: Slot): string {
  return `${formatSlotDate(slot.start)}, ${formatSlotTimeRange(slot)}`;
}

/**
 * Renders a WhatsApp-friendly slot list grouped by day, numbering only the
 * available slots (patients pick a time by that number) while still showing
 * unavailable ones inline — bold + a ❌ marker, since WhatsApp text has no
 * color support — instead of hiding them entirely. Labeled "Booked" only
 * when a real patient appointment is the cause; a doctor block or Google
 * Calendar event is labeled "Not available" instead, since no patient
 * actually booked that time.
 *
 * Returns the message body plus `offeredSlots` in the same order as the
 * numbers shown, ready to store in session data for the next step.
 */
export function buildSlotListMessage(slots: SlotWithAvailability[]): {
  message: string;
  offeredSlots: { start: string; end: string }[];
} {
  const lines: string[] = [];
  const offeredSlots: { start: string; end: string }[] = [];
  let counter = 0;
  let currentDay: string | null = null;

  for (const slot of slots) {
    const dayLabel = formatSlotDate(slot.start);
    if (dayLabel !== currentDay) {
      currentDay = dayLabel;
      lines.push(`\n*${dayLabel}*`);
    }

    if (slot.available) {
      counter++;
      offeredSlots.push({ start: slot.start.toISOString(), end: slot.end.toISOString() });
      lines.push(`${counter}. ${formatSlotTimeRange(slot)}`);
    } else {
      // Only an actual patient appointment is "Booked" — a doctor block or a
      // Google Calendar event is the doctor's own unavailability, not
      // something a patient booked.
      const label = slot.busySource === "appointment" ? "Booked" : "Not available";
      lines.push(`❌ ${formatSlotTimeRange(slot)} — *${label}*`);
    }
  }

  return { message: lines.join("\n").trim(), offeredSlots };
}

/**
 * Turns the same `offeredSlots` shown in `buildSlotListMessage` into rows for
 * a tappable WhatsApp list message. Row `id` is the 1-based index as a
 * string, matching exactly what a patient typing that number would send —
 * so tapping and typing both resolve the same way downstream.
 */
export function buildSlotListRows(
  offeredSlots: { start: string; end: string }[]
): { id: string; title: string; description: string }[] {
  return offeredSlots.map((s, i) => {
    const start = new Date(s.start);
    const end = new Date(s.end);
    return {
      id: String(i + 1),
      title: formatSlotTimeRange({ start, end }),
      description: formatSlotDate(start),
    };
  });
}
