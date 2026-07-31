import { CLINIC_NAME, SUPPORT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/config";

export const metadata = {
  title: `Privacy Policy — ${CLINIC_NAME}`,
};

// Content-only template — not legal advice. Covers the standard disclosures
// Meta's app review and most clinics expect for a WhatsApp booking system
// (what patient data is collected, which third parties process it, how to
// request deletion). Have it reviewed before relying on it for a real
// deployment, especially given India's DPDP Act.
export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: {LEGAL_LAST_UPDATED}</p>

      <p>
        This Privacy Policy explains how the WhatsApp appointment booking
        system used by {CLINIC_NAME} (&quot;the Service&quot;) collects,
        uses, and protects information when a patient or doctor uses it.
      </p>

      <h2>Information We Collect</h2>
      <p>
        When a patient books, reschedules, or cancels an appointment via
        WhatsApp, we collect their name, WhatsApp phone number, appointment
        date and time, and any notes provided during booking. When the
        doctor manages their schedule via WhatsApp, we process the doctor&apos;s
        phone number and scheduling commands.
      </p>

      <h2>How We Use Information</h2>
      <p>Information is used only to:</p>
      <ul>
        <li>Create and manage appointment bookings</li>
        <li>Send confirmation and reminder messages via WhatsApp</li>
        <li>Sync appointment data to the clinic&apos;s Google Calendar and Google Sheet for record-keeping</li>
        <li>Display schedule and patient information on the clinic&apos;s admin dashboard</li>
      </ul>

      <h2>Third-Party Services</h2>
      <p>The Service relies on the following third parties to function, each processing data under its own privacy policy:</p>
      <ul>
        <li><strong>Meta / WhatsApp Business Platform</strong> — for sending and receiving messages</li>
        <li><strong>Google Calendar &amp; Google Sheets API</strong> — for scheduling and record-keeping, under the clinic&apos;s own Google account</li>
        <li><strong>Supabase</strong> — for secure database storage of appointment and patient records</li>
      </ul>
      <p>
        We do not sell patient data or share it with any party outside of
        {" "}{CLINIC_NAME} and the third-party processors listed above.
      </p>

      <h2>Data Retention</h2>
      <p>
        Appointment and patient records are retained for as long as{" "}
        {CLINIC_NAME} uses the Service, or as required by applicable
        healthcare record-keeping regulations, whichever is longer. You may
        request deletion of your data at any time — see{" "}
        <a href="/data-deletion">Data Deletion</a>.
      </p>

      <h2>Data Security</h2>
      <p>
        We use industry-standard measures — encrypted database access and
        authenticated API connections — to protect stored data. No method of
        transmission or storage is 100% secure, and we cannot guarantee
        absolute security.
      </p>

      <h2>Your Rights</h2>
      <p>
        You may request access to, correction of, or deletion of your
        personal data by emailing{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Under
        India&apos;s Digital Personal Data Protection Act (DPDP Act, 2023),
        individuals have the right to access, correct, and request erasure
        of their personal data.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material
        changes will be reflected by updating the &quot;Last updated&quot;
        date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </>
  );
}
