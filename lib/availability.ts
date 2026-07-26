import { listAppointments } from "./db/appointments";
import { getBusyIntervals } from "./calendar";
import {
  BOOKING_WINDOW_DAYS,
  CLINIC_TIMEZONE,
  MAX_SLOTS_SHOWN,
  SLOT_MINUTES,
  WORKING_HOURS,
} from "./config";
import { toClinicLocal, fromClinicLocal } from "./timezone";

export interface Slot {
  start: Date;
  end: Date;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Builds the list of open slots over the next BOOKING_WINDOW_DAYS, working
 * hours only, skipping slots that conflict with either a CONFIRMED
 * appointment in the database or a busy block on the Google Calendar
 * (covers events created outside the bot, e.g. the doctor blocking time
 * off manually).
 */
export async function getAvailableSlots(limit = MAX_SLOTS_SHOWN): Promise<Slot[]> {
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

  const slots: Slot[] = [];
  // "Today" in the clinic's timezone, not the server's.
  const clinicNow = toClinicLocal(now);

  for (let day = 0; day < BOOKING_WINDOW_DAYS && slots.length < limit; day++) {
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

    while (slotStart < dayEnd && slots.length < limit) {
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
      if (slotEnd > dayEnd) break;

      // Only offer slots that are still in the future — this is the check
      // that keeps past-time slots off the list for "today".
      if (slotStart > now) {
        const conflict = busy.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        if (!conflict) {
          slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
        }
      }

      slotStart = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
    }
  }

  return slots;
}

export function formatSlot(slot: Slot): string {
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: CLINIC_TIMEZONE,
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TIMEZONE,
  });
  return `${dateFmt.format(slot.start)}, ${timeFmt.format(slot.start)}–${timeFmt.format(slot.end)}`;
}
