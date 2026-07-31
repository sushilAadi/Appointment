import { CLINIC_NAME, DOCTOR_WHATSAPP_NUMBER, SUPPORT_EMAIL } from "@/lib/config";

export const metadata = {
  title: `Support — ${CLINIC_NAME}`,
};

export default function SupportPage() {
  const waLink = DOCTOR_WHATSAPP_NUMBER ? `https://wa.me/${DOCTOR_WHATSAPP_NUMBER}` : null;

  return (
    <>
      <h1>Support</h1>

      <h2>Booking or appointment questions</h2>
      <p>
        For anything about an existing or upcoming appointment — booking,
        rescheduling, or cancelling — message {CLINIC_NAME} directly on
        WhatsApp{waLink ? (
          <>
            : <a href={waLink} target="_blank" rel="noopener noreferrer">{waLink}</a>
          </>
        ) : (
          " using the number provided by the clinic"
        )}.
      </p>

      <h2>Technical or account issues</h2>
      <p>
        For problems with the booking system itself — a message that
        didn&apos;t go through, a booking that didn&apos;t sync correctly,
        or account/data questions — email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We
        typically respond within 1–2 business days.
      </p>

      <h2>Common questions</h2>
      <ul>
        <li><strong>How do I book an appointment?</strong> Send a message to the clinic&apos;s WhatsApp number and follow the prompts to pick an open slot.</li>
        <li><strong>How do I cancel?</strong> Message the clinic on WhatsApp and let them know you&apos;d like to cancel — they&apos;ll confirm once it&apos;s done.</li>
        <li><strong>Is there an app to download?</strong> No — everything runs through WhatsApp, no app or account required.</li>
        <li><strong>How is my data used?</strong> See our <a href="/privacy">Privacy Policy</a>.</li>
        <li><strong>How do I delete my data?</strong> See <a href="/data-deletion">Data Deletion</a>.</li>
      </ul>
    </>
  );
}
