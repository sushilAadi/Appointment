import { CLINIC_NAME, SUPPORT_EMAIL } from "@/lib/config";

export const metadata = {
  title: `Data Deletion — ${CLINIC_NAME}`,
};

// This page is what Meta's "Data Deletion Instructions URL" app setting
// points to — an alternative to building an automated data-deletion
// callback endpoint. Clear, published instructions satisfy the
// requirement without extra API work.
export default function DataDeletionPage() {
  return (
    <>
      <h1>Data Deletion</h1>

      <p>
        You can request deletion of any personal data collected through{" "}
        {CLINIC_NAME}&apos;s WhatsApp appointment booking system at any
        time — this includes your name, phone number, and appointment
        history stored in our system.
      </p>

      <h2>How to request deletion</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from
        the address you&apos;d like us to reply to, with:
      </p>
      <ul>
        <li>Your full name</li>
        <li>The WhatsApp number used to book appointments</li>
        <li>A note that you&apos;re requesting deletion of your data</li>
      </ul>

      <h2>What happens next</h2>
      <p>
        We&apos;ll remove your record from our database within 30 days and
        confirm once it&apos;s done. Any corresponding calendar entries are
        removed at the same time. Rows already logged to the clinic&apos;s
        Google Sheet are retained as a historical record unless you
        specifically request the sheet row be cleared as well — mention
        this in your request if you&apos;d like it included.
      </p>

      <p>
        Questions about this process: see <a href="/support">Support</a> or
        our <a href="/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}
