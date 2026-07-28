import { listAppointments, listOverlappingAppointments } from "./db/appointments";
import { createDoctorBlock } from "./db/doctorBlocks";
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
  getAvailableDates,
  getSlotsForDate,
  getUpcomingWorkingDays,
  workingHoursForDate,
  midDayForDate,
  buildSlotListMessage,
  buildSlotListRows,
  formatSlot,
  formatSlotDate,
  formatSlotTimeRange,
} from "./availability";
import {
  createAppointment,
  cancelAppointment,
  completeAppointment,
  SlotUnavailableError,
} from "./appointments";
import { CLINIC_NAME, DOCTOR_NAME, isDoctor } from "./config";
import { clinicMidnight, clinicDayRange, isoDateInClinicTz, clinicLocalTimeFromIso } from "./timezone";

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

const GREETING_WORDS = ["hi", "hello", "hey", "start"];

// Every "Menu" button we send taps out to this same id, so it works as a
// global escape hatch from any step — mirrors how "cancel" already resets
// from anywhere. Kept as a shared constant so every prompt offers the same button.
const MENU_BUTTON = { id: "menu", title: "Menu" };

async function handleClientMessage(from: string, text: string) {
  const { step, data } = await getSession(from);
  const lower = text.toLowerCase();

  // Global commands work from any step.
  if (lower === "cancel" && step !== "AWAITING_CANCEL_SELECTION") {
    return startCancelFlow(from);
  }
  if (lower === "menu") {
    await resetSession(from);
    return sendClientMenu(from);
  }
  if (step === "IDLE" && GREETING_WORDS.includes(lower)) {
    return sendClientMenu(from);
  }

  switch (step) {
    case "IDLE":
      return handleClientIdle(from, lower);
    case "AWAITING_NAME":
      return handleAwaitingName(from, text, data.suggestedName);
    case "AWAITING_DATE_SELECTION":
      return handleAwaitingDateSelection(from, text, data.clientName, data.offeredDates ?? []);
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
  // Button/list row ids can't contain spaces — Meta's Graph API silently
  // rejects the whole interactive message if one does (this is why the
  // client menu could go fully silent while the doctor's menu, whose ids
  // have no spaces, kept working). Use underscores instead.
  await sendWhatsAppButtons(to, `👋 Welcome to ${CLINIC_NAME}. What would you like to do?`, [
    { id: "book", title: "Book" },
    { id: "my_appointments", title: "My Appointments" },
    { id: "cancel", title: "Cancel" },
  ]);
}

async function handleClientIdle(from: string, lower: string) {
  // Greetings are already handled in handleClientMessage before reaching
  // here (it only calls this for step === "IDLE"); nothing left to do for
  // them at this point.

  // "2"/"3" (numeric shortcuts matching the menu) checked BEFORE "1"/book,
  // and "my appointments" checked before the generic "book" text match —
  // "my appointments" contains the substring "appointment", so it must be
  // matched first or it'd be swallowed by the booking branch below.
  if (
    lower === "2" ||
    lower === "my_appointments" ||
    lower.includes("my appointment") ||
    lower === "status" ||
    lower.includes("upcoming")
  ) {
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

  return sendDateStep(from, clientName);
}

/**
 * Step 1 of booking: shows the upcoming days that still have openings, each
 * with an open-slot count, as a tappable list. Picking a date moves on to
 * step 2 (times for that day only) via handleAwaitingDateSelection.
 */
async function sendDateStep(to: string, clientName: string) {
  const dates = await getAvailableDates();

  if (dates.length === 0) {
    await resetSession(to);
    return sendWhatsAppButtons(
      to,
      `Sorry, ${DOCTOR_NAME} has no open slots in the next week. Please try again later.`,
      [MENU_BUTTON]
    );
  }

  await setSession(to, "AWAITING_DATE_SELECTION", {
    clientName,
    offeredDates: dates.map((d) => d.dateIso),
  });

  return sendWhatsAppList(
    to,
    `Thanks! Which day works best with ${DOCTOR_NAME}?`,
    "Choose a date",
    [
      {
        title: "Available dates",
        rows: dates.map((d, i) => ({
          id: String(i + 1),
          title: d.label,
          description: `${d.availableCount} slot${d.availableCount === 1 ? "" : "s"} available`,
        })),
      },
    ]
  );
}

/** Step 2 of booking: times for the one date chosen in sendDateStep. */
async function handleAwaitingDateSelection(
  from: string,
  text: string,
  clientName: string | undefined,
  offeredDates: string[]
) {
  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > offeredDates.length) {
    return sendWhatsAppButtons(
      from,
      `Please reply with a number between 1 and ${offeredDates.length}, or tap Menu to start over.`,
      [MENU_BUTTON]
    );
  }

  const dateIso = offeredDates[choice - 1];
  const daySlots = await getSlotsForDate(dateIso);
  const { message: list, offeredSlots } = buildSlotListMessage(daySlots);

  if (offeredSlots.length === 0) {
    // Someone else booked the last opening on this day since the date list
    // was shown — re-fetch and show whichever days still have openings.
    await sendWhatsAppText(from, `Sorry, that day just filled up.`);
    return sendDateStep(from, clientName ?? "Patient");
  }

  await setSession(from, "AWAITING_SLOT_SELECTION", { clientName, offeredSlots });
  await sendWhatsAppText(
    from,
    `Here are the times on ${formatSlotDate(new Date(daySlots[0].start))} (❌ = not available):\n${list}`
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
    return sendWhatsAppButtons(
      from,
      `Please reply with a number between 1 and ${offeredSlots.length}, or tap Menu to start over.`,
      [MENU_BUTTON]
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
        MENU_BUTTON,
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
    return sendWhatsAppButtons(from, `Something went wrong — let's start over.`, [MENU_BUTTON]);
  }

  const lower = text.trim().toLowerCase();

  // "menu" is handled globally in handleClientMessage before this function
  // is ever called, so it doesn't need its own check here.

  if (lower === "yes" || lower === "y") {
    await setSession(from, "AWAITING_CONCERN", { clientName, selectedSlot });
    return sendConcernPrompt(from);
  }

  if (lower === "no" || lower === "n") {
    await resetSession(from);
    return sendWhatsAppButtons(from, `No problem — that booking wasn't made.`, [MENU_BUTTON]);
  }

  return sendWhatsAppButtons(
    from,
    `Please reply "yes" to book another appointment that day, or "no" to cancel.`,
    [
      { id: "yes", title: "Yes, book" },
      { id: "no", title: "No, cancel" },
      MENU_BUTTON,
    ]
  );
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
    return sendWhatsAppButtons(from, `Something went wrong — let's start over.`, [MENU_BUTTON]);
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
      // confirmed here — show a fresh list for that same day instead of
      // failing silently.
      const dateIso = isoDateInClinicTz(new Date(selectedSlot.start));
      const daySlots = await getSlotsForDate(dateIso);
      const { message: list, offeredSlots } = buildSlotListMessage(daySlots);

      if (offeredSlots.length === 0) {
        await sendWhatsAppText(
          from,
          `Sorry, that time was just booked by someone else, and there are no other openings left that day.`
        );
        return sendDateStep(from, clientName ?? "Patient");
      }

      await setSession(from, "AWAITING_SLOT_SELECTION", { clientName, offeredSlots });
      await sendWhatsAppText(
        from,
        `Sorry, that time was just booked by someone else. Here are the current times that day (❌ = not available):\n${list}`
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
    return sendWhatsAppButtons(from, "You have no appointments yet.", [
      { id: "book", title: "Book" },
      MENU_BUTTON,
    ]);
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
    return sendWhatsAppButtons(from, "You have no upcoming appointments to cancel.", [MENU_BUTTON]);
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
  // "menu" is handled globally in handleClientMessage before this function
  // is ever called, so it doesn't need its own check here.
  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > ids.length) {
    return sendWhatsAppButtons(
      from,
      `Please reply with a number between 1 and ${ids.length}, or tap Menu to start over.`,
      [MENU_BUTTON]
    );
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
    if (role === "DOCTOR") {
      return sendWhatsAppText(from, `Something went wrong — let's start over.`);
    }
    return sendWhatsAppButtons(from, `Something went wrong — let's start over.`, [MENU_BUTTON]);
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
  return sendWhatsAppButtons(from, "Your appointment has been cancelled.", [
    { id: "book", title: "Book again" },
    MENU_BUTTON,
  ]);
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
  if (step === "AWAITING_BLOCK_DATE") {
    return handleBlockDateSelection(from, text, data.blockOfferedDates ?? []);
  }
  if (step === "AWAITING_BLOCK_RANGE") {
    return handleBlockRangeInput(from, text, data.blockDate);
  }

  // "<number> complete" — e.g. "1 complete" (typed) or "1_complete" (tapped
  // from the list — row ids can't contain spaces, see sendClientMenu) —
  // marks an appointment from the most recently shown today/week list as
  // done and starts the prescription capture step. Checked before the plain
  // numeric shortcuts below.
  const completeMatch = lower.match(/^(\d+)[\s_]*complete$/);
  if (completeMatch) {
    return startPrescriptionFlow(from, parseInt(completeMatch[1], 10), data.viewedAppointments ?? []);
  }

  if (lower === "1" || lower === "today") return listDoctorAppointments(from, "today");
  if (lower === "2" || lower === "week") return listDoctorAppointments(from, "week");
  if (lower === "3" || lower === "cancel") return startDoctorCancelFlow(from);
  if (lower === "4" || lower === "block") return startBlockFlow(from);

  return sendDoctorMenu(from);
}

async function sendDoctorMenu(to: string) {
  return sendWhatsAppList(
    to,
    `Hi ${DOCTOR_NAME}. What would you like to do? (After viewing today/week, tap a patient's row to mark that visit complete and add a prescription.)`,
    "Choose an option",
    [
      {
        rows: [
          { id: "today", title: "Today" },
          { id: "week", title: "This week" },
          { id: "cancel", title: "Cancel appointment" },
          { id: "block", title: "Block my time" },
        ],
      },
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

  // Row id is "<n>_complete" (no spaces allowed in an id) — tapping a
  // patient goes straight into the prescription flow for that visit, same
  // as typing "1 complete" would.
  return sendWhatsAppList(
    from,
    `Tap a patient once their visit is done to mark it complete and add a prescription.`,
    "Mark complete",
    [
      {
        title: "Appointments",
        rows: appointments.map((a, i) => ({
          id: `${i + 1}_complete`,
          title: a.clientName.slice(0, 24),
          description: formatSlot({ start: a.startTime, end: a.endTime }),
        })),
      },
    ]
  );
}

async function startPrescriptionFlow(from: string, index: number, viewedAppointments: string[]) {
  if (!Number.isInteger(index) || index < 1 || index > viewedAppointments.length) {
    return sendWhatsAppButtons(
      from,
      `I don't see item ${index} — tap Today or This week to see the list again, then tap a patient (or type "<number> complete").`,
      [
        { id: "today", title: "Today" },
        { id: "week", title: "This week" },
      ]
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
    return sendWhatsAppButtons(from, "There are no upcoming appointments to cancel.", [
      { id: "today", title: "Today" },
      { id: "week", title: "This week" },
    ]);
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

// ---------------------------------------------------------------------------
// Doctor: "Block my time" — configurable unavailability that the
// availability engine respects, with automatic cancel + notify for any
// confirmed appointment that falls inside the blocked window.
// ---------------------------------------------------------------------------

async function startBlockFlow(from: string) {
  const days = getUpcomingWorkingDays();
  if (days.length === 0) {
    return sendWhatsAppText(from, "No upcoming working days to block.");
  }

  await setSession(from, "AWAITING_BLOCK_DATE", { blockOfferedDates: days.map((d) => d.dateIso) });

  return sendWhatsAppList(
    from,
    `Which date would you like to block off? Tap one, or type its number.`,
    "Choose a date",
    [{ title: "Upcoming days", rows: days.map((d, i) => ({ id: String(i + 1), title: d.label })) }]
  );
}

async function handleBlockDateSelection(from: string, text: string, offeredDates: string[]) {
  const lower = text.trim().toLowerCase();
  if (lower === "menu" || lower === "cancel") {
    await resetSession(from);
    return sendDoctorMenu(from);
  }

  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > offeredDates.length) {
    return sendWhatsAppText(
      from,
      `Please reply with a number between 1 and ${offeredDates.length}, or "menu" to cancel.`
    );
  }

  const dateIso = offeredDates[choice - 1];
  await setSession(from, "AWAITING_BLOCK_RANGE", { blockDate: dateIso });

  const dateLabel = formatSlotDate(workingHoursForDate(dateIso).start);
  // A list (not buttons — buttons cap out at 3) so "Particular time" is an
  // actual tappable option, not just something buried in the body text that
  // only works if you happen to type over the buttons.
  return sendWhatsAppList(
    from,
    `Blocking time on ${dateLabel}. Choose an option.`,
    "Choose a range",
    [
      {
        title: "Block off",
        rows: [
          { id: "whole_day", title: "Whole day" },
          { id: "morning", title: "Morning" },
          { id: "afternoon", title: "Afternoon" },
          { id: "custom", title: "Particular time" },
        ],
      },
    ]
  );
}

// Parses a typed time range like "2pm-5pm", "2:30pm-4pm", or "14:00-17:00"
// into 24-hour hour/minute pairs. If only the second time has am/pm, it's
// applied to the first too (e.g. "2-5pm" means 2pm-5pm, not 2am-5pm).
const TIME_RANGE_RE =
  /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

function to24Hour(hour: number, ampm?: string): number | null {
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "am") return hour === 12 ? 0 : hour;
    return hour === 12 ? 12 : hour + 12;
  }
  // No am/pm given — accept as already being in 24-hour form.
  return hour >= 0 && hour <= 23 ? hour : null;
}

function parseTimeRange(
  text: string
): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  const m = text.trim().match(TIME_RANGE_RE);
  if (!m) return null;
  const [, h1, min1, ap1, h2, min2, ap2] = m;

  const ap2Lower = ap2?.toLowerCase();
  const ap1Lower = ap1?.toLowerCase() || ap2Lower;

  const startHour = to24Hour(parseInt(h1, 10), ap1Lower);
  const endHour = to24Hour(parseInt(h2, 10), ap2Lower);
  if (startHour === null || endHour === null) return null;

  return {
    startHour,
    startMinute: min1 ? parseInt(min1, 10) : 0,
    endHour,
    endMinute: min2 ? parseInt(min2, 10) : 0,
  };
}

async function handleBlockRangeInput(from: string, text: string, blockDateIso: string | undefined) {
  if (!blockDateIso) {
    await resetSession(from);
    return sendWhatsAppText(from, `Something went wrong — let's start over.`);
  }

  const lower = text.trim().toLowerCase();
  if (lower === "menu" || lower === "cancel") {
    await resetSession(from);
    return sendDoctorMenu(from);
  }

  // Tapped "Particular time" — just re-prompt for the actual range as text;
  // stays on this same step, so the next message falls into the custom-range
  // parser below.
  if (lower === "custom") {
    return sendWhatsAppText(
      from,
      `What time range? Type it like "2pm-5pm" or "14:00-17:00".`
    );
  }

  let start: Date;
  let end: Date;
  let rangeLabel: string;

  if (lower === "whole_day") {
    ({ start, end } = workingHoursForDate(blockDateIso));
    rangeLabel = "the whole day";
  } else if (lower === "morning") {
    start = workingHoursForDate(blockDateIso).start;
    end = midDayForDate(blockDateIso);
    rangeLabel = "the morning";
  } else if (lower === "afternoon") {
    start = midDayForDate(blockDateIso);
    end = workingHoursForDate(blockDateIso).end;
    rangeLabel = "the afternoon";
  } else {
    const parsed = parseTimeRange(text);
    if (!parsed) {
      return sendWhatsAppText(
        from,
        `Sorry, I couldn't read that time range. Try a preset, or a format like "2pm-5pm" or "14:00-17:00".`
      );
    }
    start = clinicLocalTimeFromIso(blockDateIso, parsed.startHour, parsed.startMinute);
    end = clinicLocalTimeFromIso(blockDateIso, parsed.endHour, parsed.endMinute);
    if (end <= start) {
      return sendWhatsAppText(
        from,
        `That end time is before (or the same as) the start time — please try again, e.g. "2pm-5pm".`
      );
    }
    rangeLabel = formatSlotTimeRange({ start, end });
  }

  // If blocking "today", don't reach back before the current moment — that
  // would retroactively flag an appointment that already happened earlier
  // today as cancelled-for-unavailability.
  const now = new Date();
  if (start < now) start = now;
  if (end <= start) {
    return sendWhatsAppText(from, `That time has already passed today — nothing left to block.`);
  }

  await createDoctorBlock({ start, end, reason: "Doctor unavailable" });

  // True overlap, not just "starts within the block" — a confirmed 1:45pm
  // appointment still needs to be caught by a 2pm-5pm block, since it runs
  // into that window even though it started before it.
  const affected = await listOverlappingAppointments(start, end);

  for (const appt of affected) {
    await cancelAppointment(appt.id, "DOCTOR", "Doctor unavailable during this time");

    // Proactively help the patient rebook instead of just leaving them with
    // a cancellation notice — show whichever other dates still have openings.
    try {
      const altDates = await getAvailableDates();
      if (altDates.length > 0) {
        await sendWhatsAppList(
          appt.clientPhone,
          "Here are other days with openings if you'd like to rebook.",
          "Choose a date",
          [
            {
              title: "Available dates",
              rows: altDates.map((d, i) => ({
                id: String(i + 1),
                title: d.label,
                description: `${d.availableCount} slot${d.availableCount === 1 ? "" : "s"} available`,
              })),
            },
          ]
        );
      }
    } catch (err) {
      console.error("Failed to send rebooking suggestions after doctor block", err);
    }
  }

  await resetSession(from);
  const dateLabel = formatSlotDate(start);
  return sendWhatsAppText(
    from,
    `Blocked ${dateLabel} — ${rangeLabel}.${
      affected.length > 0
        ? ` Cancelled ${affected.length} appointment${affected.length === 1 ? "" : "s"} and notified the patient${
            affected.length === 1 ? "" : "s"
          }.`
        : " No existing appointments were affected."
    }`
  );
}
