import { NextRequest, NextResponse } from "next/server";
import { createAppointment, SlotUnavailableError } from "@/lib/appointments";
import { normalizePhone, SLOT_MINUTES } from "@/lib/config";

export const dynamic = "force-dynamic";

interface BookRequestBody {
  clientName?: string;
  clientPhone?: string;
  start?: string; // ISO instant of the slot's start (from the slots endpoint)
  notes?: string;
}

// Lets the doctor (or front desk) book directly from the Schedule page,
// asking the same things the WhatsApp bot asks — and reusing that exact
// same `createAppointment` (lib/appointments.ts), so a web-created booking
// gets identical side effects to a WhatsApp-created one: the DB row, the
// Google Calendar event, the Sheet log, a WhatsApp confirmation text to the
// patient, and a WhatsApp notification to the doctor.
export async function POST(req: NextRequest) {
  let body: BookRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const clientName = (body.clientName ?? "").trim();
  if (clientName.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Please enter the patient's full name (at least 2 characters)." },
      { status: 400 }
    );
  }

  const clientPhone = normalizePhone(body.clientPhone ?? "");
  if (clientPhone.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid WhatsApp number (at least 10 digits)." },
      { status: 400 }
    );
  }

  const start = body.start ? new Date(body.start) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return NextResponse.json({ ok: false, error: "Please pick a time slot." }, { status: 400 });
  }

  // End time is always derived server-side from the fixed slot length —
  // never trust a client-supplied end time for what's actually a 30-minute
  // appointment slot.
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);

  const notes = body.notes?.trim() || null;

  try {
    const appointment = await createAppointment({ clientName, clientPhone, start, end, notes });
    return NextResponse.json({ ok: true, appointmentId: appointment.id });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Failed to create appointment from web booking form", err);
    return NextResponse.json({ ok: false, error: "Something went wrong creating the appointment." }, { status: 500 });
  }
}
