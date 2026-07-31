import { CLINIC_NAME, SUPPORT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/config";

export const metadata = {
  title: `Terms of Service — ${CLINIC_NAME}`,
};

// Content-only template — not legal advice. Have it reviewed before relying
// on it for a real deployment.
export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: {LEGAL_LAST_UPDATED}</p>

      <p>
        By using the WhatsApp appointment booking system operated by{" "}
        {CLINIC_NAME} (&quot;the Service&quot;), you agree to the following
        terms.
      </p>

      <h2>Description of Service</h2>
      <p>
        The Service provides WhatsApp-based appointment booking,
        cancellation, and schedule management for {CLINIC_NAME}, along with
        an administrative dashboard for clinic staff.
      </p>

      <h2>Use of the Service</h2>
      <p>
        The Service is provided for legitimate appointment scheduling
        purposes only. {CLINIC_NAME} is responsible for the accuracy of
        information provided to patients and for how appointment and
        patient data is used within the practice.
      </p>

      <h2>No Medical Advice</h2>
      <p>
        The Service is a scheduling tool only. It does not provide medical
        advice, diagnosis, or treatment, and is not a substitute for
        professional medical judgment.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep the Service available and reliable but do not
        guarantee uninterrupted access. The Service depends on third-party
        platforms (Meta/WhatsApp, Google, Supabase) that may experience
        their own downtime outside our control.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, {CLINIC_NAME} is not liable
        for missed appointments, data loss, or other damages arising from
        use of, or inability to use, the Service, including due to
        third-party platform outages.
      </p>

      <h2>Termination</h2>
      <p>
        Access to the Service may be suspended or terminated for any account
        that misuses it or violates these terms.
      </p>

      <h2>Governing Law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </>
  );
}
