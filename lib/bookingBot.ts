import { listAppointments } from "./db/appointments";
import { sendWhatsAppText } from "./whatsapp";
import { getSession, resetSession, setSession } from "./db/chatSessions";
import { getAvailableSlots, formatSlot } from "./availability";
import { createAppointment, cancelAppointment } from "./appointments";
import { CLINIC_NAME, DOCTOR_NAME, isDoctor } from "./config";

/** Entry point called by the webhook route for every inbound WhatsApp message. */
export async function handleIncomingMessage(from: string, rawText: string) {
  const text = rawText.trim();
  if (isDoctor(from)) {
    await handleDoctorMessage(from, text);
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
      return handleAwaitingName(from, text);
    case "AWAITING_SLOT_SELECTION":
      return handleAwaitingSlotSelection(from, text, data.offeredSlots ?? []);
    case "AWAITING_CANCEL_SELECTION":
      return handleClientCancelSelection(from, text, data.cancellableAppointments ?? []);
    default:
      await resetSession(from);
      return sendClientMenu(from);
  }
}

async function sendClientMenu(to: string) {
  await sendWhatsAppText(
    to,
    `👋 Welcome to ${CLINIC_NAME}.\n\nReply:\n1️⃣ "book" — book an appointment with ${DOCTOR_NAME}\n2️⃣ "my appointments" — view your upcoming appointments\n3️⃣ "cancel" — cancel an upcoming appointment`
  );
}

async function handleClientIdle(from: string, lower: string) {
  if (GREETING_WORDS.includes(lower)) {
    return sendClientMenu(from);
  }

  if (lower.includes("book") || lower.includes("appointment")) {
    await setSession(from, "AWAITING_NAME", {});
    return sendWhatsAppText(from, "Sure! What's the patient's full name?");
  }

  if (lower.includes("my appointment") || lower === "status" || lower.includes("upcoming")) {
    return listClientAppointments(from);
  }

  return sendClientMenu(from);
}

async function handleAwaitingName(from: string, text: string) {
  if (text.length < 2) {
    return sendWhatsAppText(from, "Please send the patient's full name (at least 2 characters).");
  }

  const slots = await getAvailableSlots();
  if (slots.length === 0) {
    await resetSession(from);
    return sendWhatsAppText(
      from,
      `Sorry, ${DOCTOR_NAME} has no open slots in the next week. Please try again later.`
    );
  }

  const list = slots
    .map((s, i) => `${i + 1}. ${formatSlot(s)}`)
    .join("\n");

  await setSession(from, "AWAITING_SLOT_SELECTION", {
    clientName: text,
    offeredSlots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
  });

  return sendWhatsAppText(
    from,
    `Thanks! Here are the next available times with ${DOCTOR_NAME}:\n\n${list}\n\nReply with the number of the time that works best.`
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

  await createAppointment({
    clientName,
    clientPhone: from,
    start: new Date(slot.start),
    end: new Date(slot.end),
  });

  await resetSession(from);
  // createAppointment already sends the confirmation message to the client.
}

async function listClientAppointments(from: string) {
  const appointments = await listAppointments({
    clientPhone: from,
    status: "CONFIRMED",
    startFrom: new Date(),
  });

  if (appointments.length === 0) {
    return sendWhatsAppText(from, "You have no upcoming appointments. Reply \"book\" to schedule one.");
  }

  const list = appointments
    .map((a) => `• ${formatSlot({ start: a.startTime, end: a.endTime })}`)
    .join("\n");

  return sendWhatsAppText(from, `Your upcoming appointments:\n\n${list}`);
}

async function startCancelFlow(from: string) {
  const appointments = await listAppointments({
    clientPhone: from,
    status: "CONFIRMED",
    startFrom: new Date(),
  });

  if (appointments.length === 0) {
    await resetSession(from);
    return sendWhatsAppText(from, "You have no upcoming appointments to cancel.");
  }

  const list = appointments
    .map((a, i) => `${i + 1}. ${formatSlot({ start: a.startTime, end: a.endTime })}`)
    .join("\n");

  await setSession(from, "AWAITING_CANCEL_SELECTION", {
    cancellableAppointments: appointments.map((a) => a.id),
  });

  return sendWhatsAppText(
    from,
    `Which appointment would you like to cancel?\n\n${list}\n\nReply with a number, or "menu" to go back.`
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

  await cancelAppointment(ids[choice - 1], "CLIENT");
  await resetSession(from);
  return sendWhatsAppText(from, "Your appointment has been cancelled. Reply \"book\" any time to schedule a new one.");
}

// ---------------------------------------------------------------------------
// Doctor side
// ---------------------------------------------------------------------------

async function handleDoctorMessage(from: string, text: string) {
  const { step, data } = await getSession(from);
  const lower = text.toLowerCase();

  if (step === "AWAITING_CANCEL_SELECTION") {
    return handleDoctorCancelSelection(from, text, data.cancellableAppointments ?? []);
  }

  if (lower === "cancel") return startDoctorCancelFlow(from);
  if (lower === "today") return listDoctorAppointments(from, "today");
  if (lower === "week") return listDoctorAppointments(from, "week");

  return sendWhatsAppText(
    from,
    `Hi ${DOCTOR_NAME}. Reply:\n"today" — today's appointments\n"week" — this week's appointments\n"cancel" — cancel an appointment`
  );
}

async function listDoctorAppointments(from: string, range: "today" | "week") {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + (range === "today" ? 1 : 7));

  const appointments = await listAppointments({
    status: "CONFIRMED",
    startFrom: start,
    startBefore: end,
  });

  if (appointments.length === 0) {
    return sendWhatsAppText(from, `No appointments ${range === "today" ? "today" : "this week"}.`);
  }

  const list = appointments
    .map((a) => `• ${formatSlot({ start: a.startTime, end: a.endTime })} — ${a.clientName} (+${a.clientPhone})`)
    .join("\n");

  return sendWhatsAppText(from, `Appointments ${range === "today" ? "today" : "this week"}:\n\n${list}`);
}

async function startDoctorCancelFlow(from: string) {
  const appointments = await listAppointments({
    status: "CONFIRMED",
    startFrom: new Date(),
    limit: 15,
  });

  if (appointments.length === 0) {
    return sendWhatsAppText(from, "There are no upcoming appointments to cancel.");
  }

  const list = appointments
    .map((a, i) => `${i + 1}. ${formatSlot({ start: a.startTime, end: a.endTime })} — ${a.clientName}`)
    .join("\n");

  await setSession(from, "AWAITING_CANCEL_SELECTION", {
    cancellableAppointments: appointments.map((a) => a.id),
  });

  return sendWhatsAppText(from, `Which appointment would you like to cancel?\n\n${list}`);
}

async function handleDoctorCancelSelection(from: string, text: string, ids: string[]) {
  const choice = parseInt(text.trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > ids.length) {
    return sendWhatsAppText(from, `Please reply with a number between 1 and ${ids.length}.`);
  }

  await cancelAppointment(ids[choice - 1], "DOCTOR");
  await resetSession(from);
  return sendWhatsAppText(from, "Appointment cancelled and the patient has been notified.");
}
