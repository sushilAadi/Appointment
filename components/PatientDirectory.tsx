"use client";

// Client-side search + accordion table for the patients directory. Data is
// fetched and formatted server-side (page.tsx) — this component only
// filters/expands and renders what it's given, so CLINIC_TIMEZONE/env logic
// never needs to ship to the browser.
import { Fragment, useMemo, useState } from "react";
import { Search, ChevronRight, CheckCircle2, XCircle, Clock, Calendar, X } from "lucide-react";
import { initialsFor } from "@/lib/format";
import PrescriptionTrigger from "./PrescriptionTrigger";

export interface VisitViewModel {
  id: string;
  dateIso: string; // clinic-local "YYYY-MM-DD", used for date search matches
  dateLabel: string;
  timeLabel: string;
  createdLabel: string;
  status: "CONFIRMED" | "COMPLETED" | "CANCELLED";
  cancelledBy: string | null;
  cancellationReason: string | null;
  prescriptionNotes: string | null;
  prescriptionPhotoUrl: string | null;
  prescriptionSlipUrl: string | null;
}

export type PatientStatusKind = "upcoming" | "inactive" | "cancelled";

export interface PatientViewModel {
  phone: string;
  name: string;
  totalVisits: number;
  statusKind: PatientStatusKind;
  upcomingLabel: string | null;
  lastVisitLabel: string | null;
  visits: VisitViewModel[];
}

const STATUS_LABEL: Record<PatientStatusKind, string> = {
  upcoming: "Upcoming visit",
  inactive: "No upcoming visit",
  cancelled: "All visits cancelled",
};

// Reuse the same light-background badge classes used everywhere else in
// the app (schedule legend, today's-appointments list) instead of a bare
// colored dot, so patient status reads consistently with appointment
// status elsewhere.
const STATUS_BADGE_CLASS: Record<PatientStatusKind, string> = {
  upcoming: "badge-confirmed",
  inactive: "badge-muted",
  cancelled: "badge-cancelled",
};

const VISIT_TITLE: Record<VisitViewModel["status"], string> = {
  CONFIRMED: "Appointment booked",
  COMPLETED: "Visit completed",
  CANCELLED: "Appointment cancelled",
};

function VisitIcon({ status }: { status: VisitViewModel["status"] }) {
  if (status === "COMPLETED") return <CheckCircle2 size={13} />;
  if (status === "CANCELLED") return <XCircle size={13} />;
  return <Clock size={13} />;
}

function matchesQuery(patient: PatientViewModel, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (patient.name.toLowerCase().includes(q)) return true;

  const qDigits = query.replace(/\D/g, "");
  if (qDigits && patient.phone.includes(qDigits)) return true;

  return patient.visits.some((v) => v.dateIso.includes(q) || v.dateLabel.toLowerCase().includes(q));
}

// dateFilter comes straight from a native <input type="date">, so it's
// already "YYYY-MM-DD" — the exact same format as VisitViewModel.dateIso.
function matchesDate(patient: PatientViewModel, dateFilter: string): boolean {
  if (!dateFilter) return true;
  return patient.visits.some((v) => v.dateIso === dateFilter);
}

export default function PatientDirectory({ patients }: { patients: PatientViewModel[] }) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => patients.filter((p) => matchesQuery(p, query) && matchesDate(p, dateFilter)),
    [patients, query, dateFilter]
  );

  function toggle(phone: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  return (
    <>
      <div className="patients-filters">
        <div className="patients-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by name or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search patients"
          />
        </div>

        <div className="patients-date-filter">
          <Calendar size={15} />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by visit date"
          />
          {dateFilter && (
            <button
              type="button"
              className="patients-date-clear"
              onClick={() => setDateFilter("")}
              aria-label="Clear date filter"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">
          No patients match{query ? ` "${query}"` : ""}
          {dateFilter ? ` on ${dateFilter}` : ""}.
        </p>
      ) : (
        <div className="ptbl-wrap">
          <table className="ptbl">
            <thead>
              <tr>
                <th className="ptbl-col-num">#</th>
                <th>Patient</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Last visit</th>
                <th>Visits</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const isOpen = expanded.has(p.phone);
                return (
                  <Fragment key={p.phone}>
                    <tr
                      className={`ptbl-row${isOpen ? " ptbl-row--open" : ""}`}
                      onClick={() => toggle(p.phone)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(p.phone);
                        }
                      }}
                    >
                      <td className="ptbl-col-num">
                        <span className="ptbl-num-cell">
                          <ChevronRight className={`ptbl-chevron${isOpen ? " ptbl-chevron--open" : ""}`} size={14} />
                          {idx + 1}
                        </span>
                      </td>
                      <td>
                        <div className="ptbl-patient">
                          <span className="avatar">{initialsFor(p.name)}</span>
                          <span className="ptbl-patient-name">{p.name}</span>
                        </div>
                      </td>
                      <td className="ptbl-muted">+{p.phone}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE_CLASS[p.statusKind]}`}>{STATUS_LABEL[p.statusKind]}</span>
                      </td>
                      <td className="ptbl-muted">{p.lastVisitLabel ?? "—"}</td>
                      <td>
                        <span className="ptbl-visits-badge">{p.totalVisits}</span>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="ptbl-accordion-row">
                        <td colSpan={6}>
                          <div className="patient-timeline">
                            {p.visits.map((v) => (
                              <div className="patient-timeline-item" key={v.id}>
                                <span className={`patient-timeline-dot patient-timeline-dot--${v.status.toLowerCase()}`}>
                                  <VisitIcon status={v.status} />
                                </span>
                                <div className="patient-timeline-content">
                                  <p className="patient-timeline-title">{VISIT_TITLE[v.status]}</p>
                                  <p className="patient-timeline-meta">
                                    {v.dateLabel} · {v.timeLabel}
                                  </p>

                                  {v.status === "CANCELLED" && (
                                    <p className="patient-timeline-note">
                                      {v.cancellationReason ?? "No reason recorded."}
                                      {v.cancelledBy ? ` — cancelled by ${v.cancelledBy.toLowerCase()}.` : ""}
                                    </p>
                                  )}

                                  {v.status === "CONFIRMED" && (
                                    <p className="patient-timeline-note">Booked on {v.createdLabel}.</p>
                                  )}

                                  {v.status === "COMPLETED" && (
                                    <div className="patient-timeline-rx">
                                      <PrescriptionTrigger
                                        className="rx-trigger-btn"
                                        clientName={p.name}
                                        clientPhone={p.phone}
                                        visitLabel={`${v.dateLabel}, ${v.timeLabel}`}
                                        notes={v.prescriptionNotes}
                                        photoUrl={v.prescriptionPhotoUrl}
                                        slipUrl={v.prescriptionSlipUrl}
                                      >
                                        View Rx
                                      </PrescriptionTrigger>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
