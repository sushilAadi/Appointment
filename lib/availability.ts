import { listAppointments } from "./db/appointments";
import { getBusyIntervals } from "./calendar";
import {
  BOOKING_WINDOW_DAYS,
  CLINIC_TIMEZONE,
  MAX_SLOTS_SHOWN,
  MAX_TOTAL_SLOTS_SHOWN,
  SLOT_MINUTES,
  WORKING_HOURS,
} from "./config";
import { toClinicLocal, fromClinicLocal } from "./timezone";

export interface Slot {
  start: Date;
  end: Date;
}

export interface SlotWithAvailability extends Slot {
  available: boolean;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Builds the full working-hours grid over the next BOOKING_WINDOW_DAYS,
 * marking each slot available/unavailable based on CONFIRMED appointments
 * in the database and busy blocks on the Google Calendar (covers events
 * created outside the bot, e.g. the doctor blocking time off manually).
 *
 * Keeps generating days until either `limitAvailable` available slots have
 * been collected, or `MAX_TOTAL_SLOTS_SHOWN` total slots (available +
 * booked) have been generated — the second cap exists so a fully-booked
 * week doesn't produce a huge WhatsApp message.
 */
export async function getSlotsWithAvailability(
  limitAvailable = MAX_SLOTS_SHOWN
): Promise<SlotWithAvailability[]> {
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + BOOKING_WINDOW_DAYS);

  const [dbAppointments, calendarBusy] = await Promise.all([
    listAppointments({ status: "CONFIRMED", startFrom: now, startBefore: windowEnd }),
    getBusyIntervals(now, windowEnd).catch((err) => {
      // Don't let a Calendar API hiccup block booking entirely — fall back
      // to DB-only availability and log for visibility.
      console.error("getBusyIntervals failed, continuing without it", err);
      return [] as { start: Date; end: Date }[];
    }),
  ]);

  const busy = [
    ...dbAppointments.map((a) => ({ start: a.startTime, end: a.endTime })),
    ...calendarBusy,
  ];

  const slots: SlotWithAvailability[] = [];
  let availableCount = 0;
  // "Today" in the clinic's timezone, not the server's.
  const clinicNow = toClinicLocal(now);

  for (
    let day = 0;
    day < BOOKING_WINDOW_DAYS && availableCount < limitAvailable && slots.length < MAX_TOTAL_SLOTS_SHOWN;
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
      slots.length < MAX_TOTAL_SLOTS_SHOWN
    ) {
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
      if (slotEnd > dayEnd) break;

      // Only include slots that are still in the future — this is the
      // check that keeps past-time slots off the list for "today".
      if (slotStart > now) {
        const conflict = busy.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        slots.push({ start: new Date(slotStart), end: new Date(slotEnd), available: !conflict });
        if (!conflict) availableCount++;
      }

      slotStart = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
    }
  }

  return slots;
}

/** Available slots only — used wherever booked slots don't need to be shown. */
export async function getAvailableSlots(limit = MAX_SLOTS_SHOWN): Promise<Slot[]> {
  const all = await getSlotsWithAvailability(limit);
  return all.filter((s) => s.available).map(({ start, end }) => ({ start, end }));
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
 * available slots (patients pick a time by that number) while still
 * showing booked slots inline — bold + a ❌ marker, since WhatsApp text has
 * no color support — instead of hiding them entirely.
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
      lines.push(`❌ ${formatSlotTimeRange(slot)} — *Booked*`);
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
