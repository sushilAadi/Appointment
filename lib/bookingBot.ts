import { listAppointments } from "./db/appointments";
import {
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppButtons,
  sendWhatsAppList,
  downloadWhatsAppMedia,
  type IncomingWhatsAppMessage,
} from "./whatsapp";
import { uploadPrescriptionPhoto } from "./storage";
import { getSession, resetSession, setSession } from "./db/chatSessions";
import {
  getSlotsWithAvailability,
  buildSlotListMessage,
  buildSlotListRows,
  formatSlot,
  formatSlotTimeRange,
} from "./availability";
import {
  createAppointment,
  cancelAppointment,
  completeAppointment,
  SlotUnavailableError,
} from "./appointments";
import { CLINIC_NAME, DOCTOR_NAME, isDoctor } from "./config";
import { clinicMidnight, clinicDayRange } from "./timezone";

/** Entry point called by the webhook route for every inbound WhatsApp message. */
export async function handleIncomingMessage(message: IncomingWhatsAppMessage) {
  const from = message.from;
  const text = message.text.trim();
  if (isDoctor(from)) {
    await handleDoctorMessage(from, text, message.image);
  } else {
    await handleClientMessage(from, text);
  }
}

// ---------------------------------------------------------------------------
// Client (patient) side
// ---------------------------------------------------------------------------

const GREETING_WORDS = ["hi", "hello", "hey", "start", "menu"];

async function handleClientMessage(from: string, text: string) {
  const { step, data } = await getSession(from);
  const lower = text.toLowerCase();

  // Global commands work from any step.
  if (lower === "cancel" && step !== "AWAITING_CANCEL_SELECTION") {
    return startCancelFlow(from);
  }
  if (lower === "menu" || lower === "start" || lower === "hi" || lower === "hello") {
    if (step === "IDLE") return sendClientMenu(from);
  }

  switch (step) {
    case "IDLE":
      return handleClientIdle(from, lower);
    case "AWAITING_NAME":
      return handleAwaitingName(from, text, data.suggestedName);
    case "AWAITING_SLOT_SELECTION":
      return handleAwaitingSlotSelection(from, text, data.offeredSlots ?? []);
    case "AWAITING_DUPLICATE_CONFIRM":
      return handleDuplicateBookingConfirm(from, text, data.clientName, data.selectedSlot);
    case "AWAITING_CONCERN":
      return handleAwaitingConcern(from, text, data.clientName, data.selectedSlot);
    case "AWAITING_CANCEL_SELECTION":
      return handleClientCancelSelection(from, text, data.cancellableAppointments ?? []);
    case "AWAITING_CANCEL_REASON":
      return handleCancelReason(from, text, data.cancelAppointmentId, "CLIENT");
    default:
      await resetSession(from);
      return sendClientMenu(from);
  }
}

async function sendClientMenu(to: string) {
  await sendWhatsAppButtons(to, `👋 Welcome to ${CLINIC_NAME}. What would you like to do?`, [
    { id: "book", title: "Book" },
    { id: "my appointments", title: "My Appointments" },
    { id: "cancel", title: "Cancel" },
  ]);
}

async function handleClientIdle(from: string, lower: string) {
  if (GREETING_WORDS.includes(lower)) {
    return sendClientMenu(from);
  }

  // "2"/"3" (numeric shortcuts matching the menu) checked BEFORE "1"/book,
  // and "my appointments" checked before the generic "book" text match —
  // "my appointments" contains the substring "appointment", so it must be
  // matched first or it'd be swallowed by the booking branch below.
  if (lower === "2" || lower.includes("my appointment") || lower === "status" || lower.includes("upcoming")) {
    return listClientAppointments(from);
  }

  if (lower === "3") {
    return startCancelFlow(from);
  }

  if (lower === "1" || lower.includes("book") || lower === "appointment") {
    return startBookingFlow(from);
  }

  return sendClientMenu(from);
}

/**
 * Recognizes returning patients by phone number (already the unique,
 * stable identifier every appointment is keyed on) and offers to reuse the
 * name from their last visit instead of asking again every time.
 */
async function startBookingFlow(from: string) {
  const priorVisits = await listAppointments({ clientPhone: from, orderAscending: false, limit: 1 });
  const priorName = priorVisits[0]?.clientName;

  if (priorName) {
    await setSession(from, "AWAITING_NAME", { suggestedName: priorName });
    return sendWhatsAppButtons(
      from,
      `Welcome back to ${CLINIC_NAME}! Your last visit was booked for "${priorName}". Tap below to reuse that name, or just type a different patient's name.`,
      [{ id: "yes", title: `Yes, ${priorName}`.slice(0, 20) }]
    );
  }

  await setSession(from, "AWAITING_NAME", {});
  return sendWhatsAppText(from, "Sure! What's the patient's full name?");
}

async function handleAwaitingName(from: string, text: string, suggestedName?: string) {
  const trimmed = text.trim();
  let clientName: string;

  if (suggestedName && trimmed.toLowerCase() === "yes") {
    clientName = suggestedName;
  } else if (trimmed.length < 2) {
    return sendWhatsAppText(from, "Please send the patient's full name (at least 2 characters).");
  } else {
    clientName = trimmed;
  }

  const slots = await getSlotsWithAvailability();
  const { message: list, offeredSlots } = buildSlotListMessage(slots);

  if (offeredSlots.length === 0) {
    await resetSession(from);
    return sendWhatsAppText(
      from,
      `Sorry, ${DOCTOR_NAME} has no open slots in the next week. Please try again later.`
    );
  }

  await setSession(from, "AWAITING_SLOT_SELECTION", {
    clientName,
    offeredSlots,
  });

  await sendWhatsAppText(
    from,
    `Thanks! Here are the times with ${DOCTOR_NAME} (❌ = already booked):\n${list}`
  );
  return sendSlotPicker(from, offeredSlots);
}

/** Sends the tappable list of available slots; row id = the same number a typed reply would be. */
async function sendSlotPicker(to: string, offeredSlots: { start: string; end: string }[]) {
  return sendWhatsAppList(
    to,
    "Tap a time to pick it, or just type its number.",
    "Choose a time",
    [{ title: "Available times", rows: buildSlotListRows(offeredSlots) }]
  );
}

async function handleAwaitingSlotSelection(
  from: string,
  text: string,
  offeredSlots: { start: string; end: string }[]
) {
  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > offeredSlots.length) {
    return sendWhatsAppText(
      from,
      `Please reply with a number between 1 and ${offeredSlots.length}, or "menu" to start over.`
    );
  }

  const { data } = await getSession(from);
  const clientName = data.clientName ?? "Patient";
  const slot = offeredSlots[choice - 1];

  // Same-day duplicate check: if this patient already has another confirmed
  // appointment on the calendar day of the slot they just picked, confirm
  // before proceeding rather than silently allowing a second booking.
  const { start: dayStart, end: dayEnd } = clinicDayRange(new Date(slot.start));
  const sameDayBookings = await listAppointments({
    clientPhone: from,
    status: "CONFIRMED",
    startFrom: dayStart,
    startBefore: dayEnd,
  });

  if (sameDayBookings.length > 0) {
    const times = sameDayBookings
      .map((a) => formatSlot({ start: a.startTime, end: a.endTime }))
      .join(", ");
    await setSession(from, "AWAITING_DUPLICATE_CONFIRM", {
      clientName,
      selectedSlot: slot,
    });
    return sendWhatsAppButtons(
      from,
      `Heads up — you already have an appointment booked that day at ${times}. Do you want to book another one?`,
      [
        { id: "yes", title: "Yes, book" },
        { id: "no", title: "No, cancel" },
      ]
    );
  }

  await setSession(from, "AWAITING_CONCERN", {
    clientName,
    selectedSlot: slot,
  });

  return sendConcernPrompt(from);
}

/** Asks for an optional visit concern, with a Skip button alongside free text. */
async function sendConcernPrompt(to: string) {
  return sendWhatsAppButtons(
    to,
    `Got it. Any specific concern or reason for the visit? (optional — type it, or tap Skip)`,
    [{ id: "skip", title: "Skip" }]
  );
}

/**
 * Handles the yes/no confirmation shown when a patient tries to book a
 * second appointment on a day they already have one. "yes" resumes the
 * normal flow (on to the concern step); "no" or "menu" abandons the booking.
 */
async function handleDuplicateBookingConfirm(
  from: string,
  text: string,
  clientName: string | undefined,
  selectedSlot: { start: string; end: string } | undefined
) {
  if (!selectedSlot) {
    // Session data got lost somehow — restart cleanly rather than crash.
    await resetSession(from);
    return sendWhatsAppText(from, `Something went wrong — let's start over. Reply "book" to try again.`);
  }

  const lower = text.trim().toLowerCase();

  if (lower === "menu") {
    await resetSession(from);
    return sendClientMenu(from);
  }

  if (lower === "yes" || lower === "y") {
    await setSession(from, "AWAITING_CONCERN", { clientName, selectedSlot });
    return sendConcernPrompt(from);
  }

  if (lower === "no" || lower === "n") {
    await resetSession(from);
    return sendWhatsAppText(from, `No problem — that booking wasn't made. Reply "menu" any time to start over.`);
  }

  return sendWhatsAppText(from, `Please reply "yes" to book another appointment that day, or "no" to cancel.`);
}

async function handleAwaitingConcern(
  from: string,
  text: string,
  clientName: string | undefined,
  selectedSlot: { start: string; end: string } | undefined
) {
  if (!selectedSlot) {
    // Session data got lost somehow — restart cleanly rather than crash.
    await resetSession(from);
    return sendWhatsAppText(from, `Something went wrong — let's start over. Reply "book" to try again.`);
  }

  const lower = text.trim().toLowerCase();
  const notes = lower === "skip" || text.trim() === "" ? null : text.trim();

  try {
    await createAppointment({
      clientName: clientName ?? "Patient",
      clientPhone: from,
      start: new Date(selectedSlot.start),
      end: new Date(selectedSlot.end),
      notes,
    });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      // Someone else grabbed this exact slot between it being listed and
      // confirmed here — show a fresh list instead of failing silently.
      const freshSlots = await getSlotsWithAvailability();
      const { message: list, offeredSlots } = buildSlotListMessage(freshSlots);

      if (offeredSlots.length === 0) {
        await resetSession(from);
        return sendWhatsAppText(
          from,
          `Sorry, that time was just booked by someone else, and there are no other open slots right now. Please try again later.`
        );
      }

      await setSession(from, "AWAITING_SLOT_SELECTION", { clientName, offeredSlots });
      await sendWhatsAppText(
        from,
        `Sorry, that time was just booked by someone else. Here are the current times (❌ = already booked):\n${list}`
      );
      return sendSlotPicker(from, offeredSlots);
    }
    throw err;
  }

  await resetSession(from);
  // createAppointment already sends the confirmation message to the client.
}

async function listClientAppointments(from: string) {
  const [upcoming, past] = await Promise.all([
    listAppointments({ clientPhone: from, status: "CONFIRMED", startFrom: new Date() }),
    listAppointments({ clientPhone: from, status: "COMPLETED", orderAscending: false, limit: 5 }),
  ]);

  if (upcoming.length === 0 && past.length === 0) {
    return sendWhatsAppText(from, "You have no appointments yet. Reply \"book\" to schedule one.");
  }

  const lines: string[] = [];
  if (upcoming.length > 0) {
    lines.push("*Upcoming:*");
    lines.push(...upcoming.map((a) => `📅 ${formatSlot({ start: a.startTime, end: a.endTime })}`));
  }
  if (past.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("*Past visits:*");
    for (const a of past) {
      let line = `✅ ${formatSlot({ start: a.startTime, end: a.endTime })}`;
      if (a.prescriptionNotes) line += `\nPrescription: ${a.prescriptionNotes}`;
      else if (a.prescriptionPhotoUrl) line += `\nPrescription: photo (sending below)`;
      lines.push(line);
    }
  }

  await sendWhatsAppText(from, lines.join("\n"));

  // A text message can't embed an image, so re-send any photo
  // prescriptions as separate image messages right after.
  for (const a of past) {
    if (a.prescriptionPhotoUrl) {
      try {
        await sendWhatsAppImage(
          from,
          a.prescriptionPhotoUrl,
          `Prescription from ${formatSlot({ start: a.startTime, end: a.endTime })}`
        );
      } catch (err) {
        console.error("Failed to resend prescription photo", err);
      }
    }
  }
}

async function startCancelFlow(from: string) {
  const appointments = await listAppointments({
    clientPhone: from,
    status: "CONFIRMED",
    startFrom: new Date(),
    limit: 10, // matches the WhatsApp list message's 10-row cap
  });

  if (appointments.length === 0) {
    await resetSession(from);
    return sendWhatsAppText(from, "You have no upcoming appointments to cancel.");
  }

  await setSession(from, "AWAITING_CANCEL_SELECTION", {
    cancellableAppointments: appointments.map((a) => a.id),
  });

  return sendWhatsAppList(
    from,
    `Which appointment would you like to cancel? Tap one, or type its number.`,
    "Select appointment",
    [
      {
        title: "Your appointments",
        rows: appointments.map((a, i) => ({
          id: String(i + 1),
          title: formatSlotTimeRange({ start: a.startTime, end: a.endTime }),
          description: formatSlot({ start: a.startTime, end: a.endTime }),
        })),
      },
    ]
  );
}

async function handleClientCancelSelection(from: string, text: string, ids: string[]) {
  if (text.toLowerCase() === "menu") {
    await resetSession(from);
    return sendClientMenu(from);
  }

  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > ids.length) {
    return sendWhatsAppText(from, `Please reply with a number between 1 and ${ids.length}.`);
  }

  await setSession(from, "AWAITING_CANCEL_REASON", { cancelAppointmentId: ids[choice - 1] });
  return sendWhatsAppButtons(
    from,
    `Got it. Any reason for cancelling? (optional — type it, or tap Skip)`,
    [{ id: "skip", title: "Skip" }]
  );
}

/**
 * Shared by both the client and doctor cancel flows. The only difference
 * is whether a reason is required: optional for the client, mandatory for
 * the doctor (re-prompts until one is given).
 */
async function handleCancelReason(
  from: string,
  text: string,
  appointmentId: string | undefined,
  role: "CLIENT" | "DOCTOR"
) {
  if (!appointmentId) {
    // Session data got lost somehow — restart cleanly rather than crash.
    await resetSession(from);
    return sendWhatsAppText(from, `Something went wrong — let's start over.`);
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (role === "DOCTOR") {
    if (trimmed === "" || lower === "skip") {
      return sendWhatsAppText(
        from,
        `A reason is required to cancel this appointment — please describe why (e.g. "doctor unavailable", "patient rescheduling").`
      );
    }
    await cancelAppointment(appointmentId, "DOCTOR", trimmed);
    await resetSession(from);
    return sendWhatsAppText(from, "Appointment cancelled and the patient has been notified.");
  }

  const reason = trimmed === "" || lower === "skip" ? null : trimmed;
  await cancelAppointment(appointmentId, "CLIENT", reason);
  await resetSession(from);
  return sendWhatsAppText(from, "Your appointment has been cancelled. Reply \"book\" any time to schedule a new one.");
}

// ---------------------------------------------------------------------------
// Doctor side
// ---------------------------------------------------------------------------

async function handleDoctorMessage(
  from: string,
  text: string,
  image?: { mediaId: string; mimeType: string }
) {
  const { step, data } = await getSession(from);
  const lower = text.toLowerCase();

  if (step === "AWAITING_CANCEL_SELECTION") {
    return handleDoctorCancelSelection(from, text, data.cancellableAppointments ?? []);
  }
  if (step === "AWAITING_CANCEL_REASON") {
    return handleCancelReason(from, text, data.cancelAppointmentId, "DOCTOR");
  }
  if (step === "AWAITING_PRESCRIPTION") {
    return handlePrescriptionInput(from, text, image, data.prescribeAppointmentId);
  }

  // "<number> complete" — e.g. "1 complete" — marks an appointment from the
  // most recently shown today/week list as done and starts the prescription
  // capture step. Checked before the plain numeric shortcuts below.
  const completeMatch = lower.match(/^(\d+)\s*complete$/);
  if (completeMatch) {
    return startPrescriptionFlow(from, parseInt(completeMatch[1], 10), data.viewedAppointments ?? []);
  }

  if (lower === "1" || lower === "today") return listDoctorAppointments(from, "today");
  if (lower === "2" || lower === "week") return listDoctorAppointments(from, "week");
  if (lower === "3" || lower === "cancel") return startDoctorCancelFlow(from);

  return sendWhatsAppButtons(
    from,
    `Hi ${DOCTOR_NAME}. What would you like to do? (After viewing today/week, tap a patient's row to mark that visit complete and add a prescription.)`,
    [
      { id: "today", title: "Today" },
      { id: "week", title: "This week" },
      { id: "cancel", title: "Cancel appt" },
    ]
  );
}

async function listDoctorAppointments(from: string, range: "today" | "week") {
  const start = clinicMidnight(0);
  const end = clinicMidnight(range === "today" ? 1 : 7);

  const appointments = await listAppointments({
    status: "CONFIRMED",
    startFrom: start,
    startBefore: end,
  });

  if (appointments.length === 0) {
    await setSession(from, "IDLE", { viewedAppointments: [] });
    return sendWhatsAppText(from, `No appointments ${range === "today" ? "today" : "this week"}.`);
  }

  const list = appointments
    .map((a, i) => `${i + 1}. ${formatSlot({ start: a.startTime, end: a.endTime })} — ${a.clientName} (+${a.clientPhone})`)
    .join("\n");

  // Remembered so "<number> complete" can resolve which appointment a
  // number refers to.
  await setSession(from, "IDLE", { viewedAppointments: appointments.map((a) => a.id) });

  await sendWhatsAppText(
    from,
    `Appointments ${range === "today" ? "today" : "this week"}:\n\n${list}`
  );

  // Row id is "<n> complete" — tapping a patient goes straight into the
  // prescription flow for that visit, same as typing "1 complete" would.
  return sendWhatsAppList(
    from,
    `Tap a patient once their visit is done to mark it complete and add a prescription.`,
    "Mark complete",
    [
      {
        title: "Appointments",
        rows: appointments.map((a, i) => ({
          id: `${i + 1} complete`,
          title: a.clientName.slice(0, 24),
          description: formatSlot({ start: a.startTime, end: a.endTime }),
        })),
      },
    ]
  );
}

async function startPrescriptionFlow(from: string, index: number, viewedAppointments: string[]) {
  if (!Number.isInteger(index) || index < 1 || index > viewedAppointments.length) {
    return sendWhatsAppText(
      from,
      `I don't see item ${index} — reply "today" or "week" first to see the numbered list, then "<number> complete".`
    );
  }

  await setSession(from, "AWAITING_PRESCRIPTION", {
    prescribeAppointmentId: viewedAppointments[index - 1],
  });

  return sendWhatsAppButtons(
    from,
    `Marking that visit complete. Type the prescription/notes, send a photo of it (caption optional), or tap Skip to finish with no prescription attached.`,
    [{ id: "skip", title: "Skip" }]
  );
}

async function handlePrescriptionInput(
  from: string,
  text: string,
  image: { mediaId: string; mimeType: string } | undefined,
  appointmentId: string | undefined
) {
  if (!appointmentId) {
    // Session data got lost somehow — restart cleanly rather than crash.
    await resetSession(from);
    return sendWhatsAppText(from, `Something went wrong — let's start over.`);
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (!image && (lower === "skip" || trimmed === "")) {
    await completeAppointment(appointmentId, { notes: null, photoUrl: null });
    await resetSession(from);
    return sendWhatsAppText(from, "Marked complete with no prescription attached.");
  }

  let photoUrl: string | null = null;
  if (image) {
    try {
      const { buffer, mimeType } = await downloadWhatsAppMedia(image.mediaId);
      photoUrl = await uploadPrescriptionPhoto(buffer, mimeType);
    } catch (err) {
      console.error("Failed to process prescription photo", err);
      return sendWhatsAppText(
        from,
        "Sorry, I couldn't process that photo — please try sending it again, or type the prescription as text instead."
      );
    }
  }

  // For an image, `trimmed` is the caption (may be empty); for text-only
  // it's the typed notes.
  const notes = trimmed || null;

  await completeAppointment(appointmentId, { notes, photoUrl });
  await resetSession(from);
  return sendWhatsAppText(from, "Saved and sent to the patient.");
}

async function startDoctorCancelFlow(from: string) {
  const appointments = await listAppointments({
    status: "CONFIRMED",
    startFrom: new Date(),
    limit: 10, // matches the WhatsApp list message's 10-row cap
  });

  if (appointments.length === 0) {
    return sendWhatsAppText(from, "There are no upcoming appointments to cancel.");
  }

  await setSession(from, "AWAITING_CANCEL_SELECTION", {
    cancellableAppointments: appointments.map((a) => a.id),
  });

  return sendWhatsAppList(
    from,
    `Which appointment would you like to cancel? Tap one, or type its number.`,
    "Select appointment",
    [
      {
        title: "Upcoming appointments",
        rows: appointments.map((a, i) => ({
          id: String(i + 1),
          title: a.clientName.slice(0, 24),
          description: formatSlot({ start: a.startTime, end: a.endTime }),
        })),
      },
    ]
  );
}

async function handleDoctorCancelSelection(from: string, text: string, ids: string[]) {
  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > ids.length) {
    return sendWhatsAppText(from, `Please reply with a number between 1 and ${ids.length}.`);
  }

  await setSession(from, "AWAITING_CANCEL_REASON", { cancelAppointmentId: ids[choice - 1] });
  return sendWhatsAppText(
    from,
    `Please provide a reason for cancelling this appointment (required — the patient will see this):`
  );
}
