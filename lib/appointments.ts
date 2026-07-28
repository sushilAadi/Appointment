import {
  cancelAppointmentRecord,
  createAppointmentRecord,
  getAppointmentById,
  isSlotTaken,
  markAppointmentComplete,
  setAppointmentGoogleEventId,
  setAppointmentPrescriptionSlipUrl,
  SlotUnavailableError,
  type Appointment,
} from "./db/appointments";

export { SlotUnavailableError };
import { createCalendarEvent, deleteCalendarEvent } from "./calendar";
import { appendAppointmentRow, updateAppointmentStatusInSheet } from "./sheets";
import { sendWhatsAppText, sendWhatsAppImage, sendWhatsAppDocument } from "./whatsapp";
import { CLINIC_NAME, DOCTOR_NAME, DOCTOR_WHATSAPP_NUMBER } from "./config";
import { formatSlot } from "./availability";
import { getDoctorPrescriptionSettings } from "./db/clinicSettings";
import { generatePrescriptionSlipPdf } from "./prescriptionSlip";
import { uploadPrescriptionSlip } from "./storage";

/**
 * Short, unique per-visit reference printed on the prescription slip. Not a
 * separate counter to maintain — it's derived from the appointment's own
 * database id, which already can't collide or be reissued, since an
 * appointment can only be completed once. Just formatted to be short enough
 * for a patient or pharmacist to read back over the phone.
 */
function prescriptionNumberFor(appointmentId: string): string {
  return `RX-${appointmentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

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
 * did NOT initiate the cancellation. `reason` is optional when the client
 * cancels and expected (enforced by the bot conversation, not here) when
 * the doctor cancels.
 */
export async function cancelAppointment(
  appointmentId: string,
  cancelledBy: "CLIENT" | "DOCTOR",
  reason?: string | null
): Promise<Appointment | null> {
  const existing = await getAppointmentById(appointmentId);
  if (!existing || existing.status === "CANCELLED") return null;

  const updated = await cancelAppointmentRecord(appointmentId, cancelledBy, reason);
  if (!updated) return null;

  if (updated.googleEventId) {
    try {
      await deleteCalendarEvent(updated.googleEventId);
    } catch (err) {
      console.error("Failed to delete Google Calendar event", err);
    }
  }

  try {
    await updateAppointmentStatusInSheet(updated.id, "CANCELLED", updated.cancellationReason);
  } catch (err) {
    console.error("Failed to update Google Sheet status", err);
  }

  const slotText = formatSlot({ start: updated.startTime, end: updated.endTime });

  if (cancelledBy === "CLIENT") {
    if (DOCTOR_WHATSAPP_NUMBER) {
      try {
        await sendWhatsAppText(
          DOCTOR_WHATSAPP_NUMBER,
          `Appointment cancelled by patient ❌\n\nPatient: ${updated.clientName}\nPhone: +${updated.clientPhone}\n🗓 ${slotText}${
            updated.cancellationReason ? `\nReason: ${updated.cancellationReason}` : ""
          }`
        );
      } catch (err) {
        console.error("Failed to notify doctor of cancellation", err);
      }
    }
  } else {
    try {
      await sendWhatsAppText(
        updated.clientPhone,
        `Your appointment with ${DOCTOR_NAME} on ${slotText} has been cancelled by the clinic.${
          updated.cancellationReason ? `\nReason: ${updated.cancellationReason}` : ""
        }\nReply "book" to pick a new time.`
      );
    } catch (err) {
      console.error("Failed to notify client of cancellation", err);
    }
  }

  return updated;
}

/**
 * Marks a visit complete and attaches a prescription (text notes, a photo,
 * or both — either may be null/omitted). Immediately forwards whatever was
 * captured to the patient over WhatsApp, and logs the status change in the
 * Sheet. This is how prescriptions actually reach the patient — the doctor
 * sends the photo/notes to the bot, not directly to the patient.
 */
export async function completeAppointment(
  appointmentId: string,
  input: { notes?: string | null; photoUrl?: string | null }
): Promise<Appointment | null> {
  const updated = await markAppointmentComplete(appointmentId, {
    prescriptionNotes: input.notes,
    prescriptionPhotoUrl: input.photoUrl,
  });
  if (!updated) return null;

  try {
    await updateAppointmentStatusInSheet(updated.id, "COMPLETED");
  } catch (err) {
    console.error("Failed to update Google Sheet status", err);
  }

  const slotText = formatSlot({ start: updated.startTime, end: updated.endTime });

  // Any raw photo the doctor sent (e.g. a handwritten note) goes to the
  // patient as-is, same as before — it's a reference, not the official
  // record.
  if (updated.prescriptionPhotoUrl) {
    try {
      await sendWhatsAppImage(
        updated.clientPhone,
        updated.prescriptionPhotoUrl,
        `Photo from your visit on ${slotText} with ${DOCTOR_NAME}.`
      );
    } catch (err) {
      console.error("Failed to send prescription photo", err);
    }
  }

  if (updated.prescriptionNotes) {
    // Typed notes become the official record: a formatted, signed PDF slip
    // (clinic name, doctor name + registration number, patient details, the
    // medicines as typed, a unique Rx number, and the doctor's saved
    // signature) — this is what makes a typed WhatsApp message function as
    // a real prescription instead of just a casual note.
    try {
      const settings = await getDoctorPrescriptionSettings();
      if (settings.registrationNumber && settings.signatureUrl) {
        const pdfBuffer = await generatePrescriptionSlipPdf({
          prescriptionNumber: prescriptionNumberFor(updated.id),
          doctorRegistrationNumber: settings.registrationNumber,
          signatureUrl: settings.signatureUrl,
          patientName: updated.clientName,
          patientPhone: updated.clientPhone,
          visitDateLabel: slotText,
          medicines: updated.prescriptionNotes,
        });
        const slipUrl = await uploadPrescriptionSlip(pdfBuffer);
        await setAppointmentPrescriptionSlipUrl(updated.id, slipUrl);
        await sendWhatsAppDocument(
          updated.clientPhone,
          slipUrl,
          `Prescription-${prescriptionNumberFor(updated.id)}.pdf`,
          `Prescription from your visit on ${slotText} with ${DOCTOR_NAME}.`
        );
      } else {
        // Doctor setup (registration number / signature) isn't complete yet
        // — fall back to plain text rather than block the notification.
        await sendWhatsAppText(
          updated.clientPhone,
          `Your visit on ${slotText} is complete. Notes from ${DOCTOR_NAME}:\n\n${updated.prescriptionNotes}`
        );
      }
    } catch (err) {
      console.error("Failed to generate/send prescription slip", err);
      try {
        await sendWhatsAppText(
          updated.clientPhone,
          `Your visit on ${slotText} is complete. Notes from ${DOCTOR_NAME}:\n\n${updated.prescriptionNotes}`
        );
      } catch (err2) {
        console.error("Failed to send fallback prescription text", err2);
      }
    }
  }

  if (!updated.prescriptionPhotoUrl && !updated.prescriptionNotes) {
    try {
      await sendWhatsAppText(
        updated.clientPhone,
        `Your visit on ${slotText} with ${DOCTOR_NAME} has been marked complete. Thank you!`
      );
    } catch (err) {
      console.error("Failed to notify client of completed visit", err);
    }
  }

  return updated;
}
