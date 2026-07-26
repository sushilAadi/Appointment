import { listAppointments } from "@/lib/db/appointments";
import { CLINIC_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type FilterValue = "upcoming" | "all" | "cancelled";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter = (searchParams.filter as FilterValue) || "upcoming";

  const appointments = await listAppointments(
    filter === "upcoming"
      ? { status: "CONFIRMED", startFrom: new Date(), limit: 200 }
      : filter === "cancelled"
      ? { status: "CANCELLED", orderAscending: false, limit: 200 }
      : { limit: 200 }
  );

  return (
    <main className="container">
      <div className="card">
        <h1>{CLINIC_NAME} — Appointments</h1>

        <div className="filters" style={{ marginBottom: 16 }}>
          <a href="?filter=upcoming" className={filter === "upcoming" ? "active" : ""}>
            Upcoming
          </a>
          <a href="?filter=cancelled" className={filter === "cancelled" ? "active" : ""}>
            Cancelled
          </a>
          <a href="?filter=all" className={filter === "all" ? "active" : ""}>
            All
          </a>
        </div>

        {appointments.length === 0 ? (
          <p>No appointments in this view.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Phone</th>
                <th>Date &amp; time</th>
                <th>Status</th>
                <th>Booked</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>{a.clientName}</td>
                  <td>+{a.clientPhone}</td>
                  <td>{dateFmt.format(a.startTime)}</td>
                  <td>
                    <span
                      className={`badge ${
                        a.status === "CONFIRMED" ? "badge-confirmed" : "badge-cancelled"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td>{dateFmt.format(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
