import { NextRequest, NextResponse } from "next/server";
import { getSlotsForDate, formatSlotTimeRange } from "@/lib/availability";

export const dynamic = "force-dynamic";

// Backs the web booking form's time-slot picker — same
// available/booked/not-available computation the WhatsApp bot uses
// (lib/availability.ts), so the two booking paths can never disagree about
// what's actually open.
export async function GET(req: NextRequest) {
  const dateIso = req.nextUrl.searchParams.get("date");
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid ?date=YYYY-MM-DD" }, { status: 400 });
  }

  // A very generous cap — this is the doctor's own booking form, not the
  // WhatsApp message-length-constrained list, so show the whole day.
  const slots = await getSlotsForDate(dateIso, 1000);

  return NextResponse.json({
    ok: true,
    slots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      available: s.available,
      busySource: s.busySource ?? null,
      label: formatSlotTimeRange(s),
    })),
  });
}
