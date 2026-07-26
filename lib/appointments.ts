import {
  cancelAppointmentRecord,
  createAppointmentRecord,
  getAppointmentById,
  isSlotTaken,
  setAppointmentGoogleEventId,
  SlotUnavailableError,
  type Appointment,
} from "./db/appointments";

export { SlotUnavailableError };
import { createCalendarEvent, deleteCalendarEvent } from "./calendar";
import { appendAppointmentRow, updateAppointmentStatusInSheet } from "./sheets";
import { sendWhatsAppText } from "./whatsapp";
import { CLINIC_NAME, DOCTOR_NAME, DOCTOR_WHATSAPP_NUMBER } from "./config";
import { formatSlot } from "./availability";

/**
 * Single entry point for creating a booking. Writes the DB row, creates the
 * Google Calendar event, logs a row in the Google Sheet, and notifies both
 * the client and the doctor over WhatsApp. Each side effect is best-effort
 * and logged on failure so one broken integration doesn't roll back a
 * confirmed appointment the patient already saw on screen.
 *
 * Throws SlotUnavailableError if the slot is already booked — either caught
 * here proactively, or surfaced by the database's unique constraint if two
 * bookings land at almost the same instant. Callers (the WhatsApp bot)
 * should catch this and offer the patient a fresh slot list.
 */
export async function createAppointment(input: {
  clientName: string;
  clientPhone: string;
  start: Date;
  end: Date;
  notes?: string | null;
}): Promise<Appointment> {
  if (await isSlotTaken(input.start, input.end)) {
    throw new SlotUnavailableError();
  }

  const appointment = await createAppointmentRecord({
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    startTime: input.start,
    endTime: input.end,
    notes: input.notes,
  });

  const summary = `${input.clientName} — ${CLINIC_NAME}`;
  const description = [
    `Patient: ${input.clientName}`,
    `Phone: +${input.clientPhone}`,
    input.notes ? `Concern: ${input.notes}` : null,
    `Booked via WhatsApp bot.`,
    `Appointment ID: ${appointment.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const eventId = await createCalendarEvent({
      summary,
      description,
      start: input.start,
      end: input.end,
    });
    await setAppointmentGoogleEventId(appointment.id, eventId);
  } catch (err) {
    console.error("Failed to create Google Calendar event", err);
  }

  try {
    await appendAppointmentRow({
      id: appointment.id,
      clientName: appointment.clientName,
      clientPhone: appointment.clientPhone,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      notes: appointment.notes,
      createdAt: appointment.createdAt,
    });
  } catch (err) {
    console.error("Failed to log appointment to Google Sheet", err);
  }

  const slotText = formatSlot({ start: input.start, end: input.end });

  try {
    await sendWhatsAppText(
      input.clientPhone,
      `You're confirmed with ${DOCTOR_NAME} at ${CLINIC_NAME}.\n\n🗓 ${slotText}\n\nReply "cancel" any time to cancel this appointment.`
    );
  } catch (err) {
    console.error("Failed to notify client", err);
  }

  if (DOCTOR_WHATSAPP_NUMBER) {
    try {
      await sendWhatsAppText(
        DOCTOR_WHATSAPP_NUMBER,
        `New appointment booked ✅\n\nPatient: ${input.clientName}\nPhone: +${input.clientPhone}\n🗓 ${slotText}${
          input.notes ? `\nConcern: ${input.notes}` : ""
        }\n\nReply "cancel" to cancel an appointment, or "today"/"week" to view your schedule.`
      );
    } catch (err) {
      console.error("Failed to notify doctor", err);
    }
  }

  return appointment;
}

/**
 * Cancels an existing appointment: marks it CANCELLED in the DB, deletes
 * the Calendar event, updates the Sheet row, and notifies whichever side
 * did NOT initiate the cancellation.
 */
export async function cancelAppointment(
  appointmentId: string,
  cancelledBy: "CLIENT" | "DOCTOR"
): Promise<Appointment | null> {
  const existing = await getAppointmentById(appointmentId);
  if (!existing || existing.status === "CANCELLED") return null;

  const updated = await cancelAppointmentRecord(appointmentId, cancelledBy);
  if (!updated) return null;

  if (updated.googleEventId) {
    try {
      await deleteCalendarEvent(updated.googleEventId);
    } catch (err) {
      console.error("Failed to delete Google Calendar event", err);
    }
  }

  try {
    await updateAppointmentStatusInSheet(updated.id, "CANCELLED");
  } catch (err) {
    console.error("Failed to update Google Sheet status", err);
  }

  const slotText = formatSlot({ start: updated.startTime, end: updated.endTime });

  if (cancelledBy === "CLIENT") {
    if (DOCTOR_WHATSAPP_NUMBER) {
      try {
        await sendWhatsAppText(
          DOCTOR_WHATSAPP_NUMBER,
          `Appointment cancelled by patient ❌\n\nPatient: ${updated.clientName}\nPhone: +${updated.clientPhone}\n🗓 ${slotText}`
        );
      } catch (err) {
        console.error("Failed to notify doctor of cancellation", err);
      }
    }
  } else {
    try {
      await sendWhatsAppText(
        updated.clientPhone,
        `Your appointment with ${DOCTOR_NAME} on ${slotText} has been cancelled by the clinic. Reply "book" to pick a new time.`
      );
    } catch (err) {
      console.error("Failed to notify client of cancellation", err);
    }
  }

  return updated;
}
