import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/db/appointments";
import { CLINIC_TIMEZONE } from "@/lib/config";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CLINIC_TIMEZONE,
});

function csvCell(value: string): string {
  // Quote any cell that contains a comma, quote, or newline; double up
  // internal quotes per the CSV spec.
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// A "quick actions" export button hits this — plain CSV of every
// appointment, meant for the doctor's own records/accounting, not a
// public endpoint (same access level as the rest of the dashboard).
export async function GET() {
  const appointments = await listAppointments({ limit: 5000 });

  const header = [
    "Patient name",
    "Phone",
    "Start time",
    "End time",
    "Status",
    "Cancelled by",
    "Cancellation reason",
    "Prescription notes",
    "Booked at",
  ];

  const rows = appointments.map((a) =>
    [
      a.clientName,
      `+${a.clientPhone}`,
      dateFmt.format(a.startTime),
      dateFmt.format(a.endTime),
      a.status,
      a.cancelledBy ?? "",
      a.cancellationReason ?? "",
      a.prescriptionNotes ?? "",
      dateFmt.format(a.createdAt),
    ]
      .map(csvCell)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointments-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
