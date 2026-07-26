import Link from "next/link";
import { CLINIC_NAME, DOCTOR_NAME } from "@/lib/config";

export default function HomePage() {
  return (
    <main className="container">
      <div className="card">
        <h1>{CLINIC_NAME}</h1>
        <p>WhatsApp appointment booking is running for {DOCTOR_NAME}.</p>
        <p>
          Patients book by messaging your WhatsApp Business number. View and
          manage bookings on the{" "}
          <Link href="/appointments">appointments dashboard</Link>.
        </p>
      </div>
    </main>
  );
}
