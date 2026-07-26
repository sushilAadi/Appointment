import { google } from "googleapis";
import { getGoogleAuthClient } from "./googleAuth";

function calendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error("GOOGLE_CALENDAR_ID is not set");
  return id;
}

function calendarClient() {
  return google.calendar({ version: "v3", auth: getGoogleAuthClient() });
}

export interface CreateEventInput {
  summary: string;
  description: string;
  start: Date;
  end: Date;
}

/** Creates a calendar event and returns its Google event id. */
export async function createCalendarEvent(
  input: CreateEventInput
): Promise<string> {
  const calendar = calendarClient();
  const res = await calendar.events.insert({
    calendarId: calendarId(),
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    },
  });
  if (!res.data.id) throw new Error("Google Calendar did not return an event id");
  return res.data.id;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const calendar = calendarClient();
  try {
    await calendar.events.delete({ calendarId: calendarId(), eventId });
  } catch (err: any) {
    // Already deleted / not found — safe to ignore so cancellation flow
    // doesn't get stuck if the event was removed manually.
    if (err?.code !== 404 && err?.response?.status !== 404) {
      throw err;
    }
  }
}

/** Returns [{start, end}] busy intervals between `from` and `to`. */
export async function getBusyIntervals(
  from: Date,
  to: Date
): Promise<{ start: Date; end: Date }[]> {
  const calendar = calendarClient();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId() }],
    },
  });

  const busy = res.data.calendars?.[calendarId()]?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: new Date(b.start as string), end: new Date(b.end as string) }));
}
