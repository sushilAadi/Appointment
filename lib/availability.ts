import { listAppointments } from "./db/appointments";
import { getBusyIntervals } from "./calendar";
import {
  BOOKING_WINDOW_DAYS,
  MAX_SLOTS_SHOWN,
  SLOT_MINUTES,
  WORKING_HOURS,
} from "./config";

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
  const cursor = new Date(now);
  cursor.setSeconds(0, 0);
  // Round up to the next slot boundary.
  const remainder = cursor.getMinutes() % SLOT_MINUTES;
  if (remainder !== 0) cursor.setMinutes(cursor.getMinutes() + (SLOT_MINUTES - remainder));

  for (let day = 0; day < BOOKING_WINDOW_DAYS && slots.length < limit; day++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + day);
    dayDate.setHours(0, 0, 0, 0);

    if (WORKING_HOURS.closedDays.includes(dayDate.getDay())) continue;

    const dayStart = new Date(dayDate);
    dayStart.setHours(WORKING_HOURS.startHour, 0, 0, 0);
    const dayEnd = new Date(dayDate);
    dayEnd.setHours(WORKING_HOURS.endHour, 0, 0, 0);

    let slotStart = day === 0 && cursor > dayStart ? new Date(cursor) : new Date(dayStart);

    while (slotStart < dayEnd && slots.length < limit) {
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);
      if (slotEnd > dayEnd) break;

      const conflict = busy.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
      if (!conflict && slotStart > now) {
        slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
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
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFmt.format(slot.start)}, ${timeFmt.format(slot.start)}–${timeFmt.format(slot.end)}`;
}
