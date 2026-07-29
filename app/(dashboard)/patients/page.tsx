import { listAppointments, type Appointment } from "@/lib/db/appointments";
import { CLINIC_TIMEZONE } from "@/lib/config";
import { isoDateInClinicTz } from "@/lib/timezone";
import PatientDirectory, { type PatientViewModel, type VisitViewModel } from "@/components/PatientDirectory";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: CLINIC_TIMEZONE,
});

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIMEZONE });

function toVisitViewModel(a: Appointment): VisitViewModel {
  return {
    id: a.id,
    dateIso: isoDateInClinicTz(a.startTime),
    dateLabel: dateFmt.format(a.startTime),
    timeLabel: `${timeFmt.format(a.startTime)} – ${timeFmt.format(a.endTime)}`,
    createdLabel: dateFmt.format(a.createdAt),
    status: a.status,
    cancelledBy: a.cancelledBy,
    cancellationReason: a.cancellationReason,
    prescriptionNotes: a.prescriptionNotes,
    prescriptionPhotoUrl: a.prescriptionPhotoUrl,
    prescriptionSlipUrl: a.prescriptionSlipUrl,
  };
}

function buildPatientViewModels(appointments: Appointment[]): PatientViewModel[] {
  const byPhone = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = byPhone.get(a.clientPhone) ?? [];
    list.push(a);
    byPhone.set(a.clientPhone, list);
  }

  const now = Date.now();
  const models: PatientViewModel[] = [];

  for (const [phone, list] of byPhone) {
    // Most recent booking's name wins, in case a patient's name was
    // corrected on a later booking.
    const sortedByCreated = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const name = sortedByCreated[0].clientName;

    const upcoming =
      list
        .filter((a) => a.status === "CONFIRMED" && a.startTime.getTime() >= now)
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0] ?? null;

    const byStartDesc = [...list].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    const lastVisit = byStartDesc.find((a) => a.status === "COMPLETED") ?? byStartDesc[0] ?? null;

    const statusKind: PatientViewModel["statusKind"] = upcoming
      ? "upcoming"
      : list.every((a) => a.status === "CANCELLED")
        ? "cancelled"
        : "inactive";

    models.push({
      phone,
      name,
      totalVisits: list.filter((a) => a.status === "COMPLETED").length,
      statusKind,
      upcomingLabel: upcoming ? dateFmt.format(upcoming.startTime) : null,
      lastVisitLabel: lastVisit ? dateFmt.format(lastVisit.startTime) : null,
      visits: byStartDesc.map(toVisitViewModel),
    });
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export default async function PatientsPage() {
  const appointments = await listAppointments({ limit: 1000 });
  const patients = buildPatientViewModels(appointments);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Directory</p>
          <h1 className="page-title">Patients</h1>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{patients.length}</div>
          <div className="stat-label">Total patients</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{patients.filter((p) => p.upcomingLabel).length}</div>
          <div className="stat-label">With upcoming visit</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Patient directory</h2>
        </div>

        {patients.length === 0 ? <p className="empty-state">No patients yet.</p> : <PatientDirectory patients={patients} />}
      </section>
    </>
  );
}
