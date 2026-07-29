"use client";

// "+ New appointment" on the Schedule page — same fields the WhatsApp bot
// asks (name, date, time slot, concern), backed by the same availability
// engine (lib/availability.ts via /api/appointments/slots) and the same
// `createAppointment` the bot uses (via /api/appointments/book), so a
// web-booked visit gets the identical WhatsApp confirmation (to the
// patient) and notification (to the doctor) a bot-booked one does.
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, CheckCircle2 } from "lucide-react";

export interface DayOption {
  dateIso: string;
  label: string;
}

interface SlotOption {
  start: string;
  end: string;
  available: boolean;
  busySource: string | null;
  label: string;
}

export default function BookAppointmentModal({ upcomingDays }: { upcomingDays: DayOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(upcomingDays[0]?.dateIso ?? "");
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !selectedDate) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedStart(null);
    fetch(`/api/appointments/slots?date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSlots(data.ok ? data.slots : []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedDate]);

  function resetAndClose() {
    setOpen(false);
    setClientName("");
    setClientPhone("");
    setNotes("");
    setSelectedStart(null);
    setSlots(null);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedStart) {
      setError("Please pick a time slot.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, clientPhone, start: selectedStart, notes }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      setSuccess("Appointment booked — a WhatsApp confirmation was sent to the patient, and the doctor was notified.");
      setSubmitting(false);
      router.refresh();
      setTimeout(resetAndClose, 1800);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> New appointment
      </button>

      {open && (
        <div className="rx-modal-backdrop" onClick={() => !submitting && resetAndClose()}>
          <div
            className="rx-modal book-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Book appointment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rx-modal-header">
              <div>
                <p className="rx-modal-eyebrow">New appointment</p>
                <h2>Book a visit</h2>
              </div>
              <button type="button" className="icon-btn" onClick={resetAndClose} aria-label="Close" disabled={submitting}>
                <X size={16} />
              </button>
            </div>

            {success ? (
              <div className="book-success">
                <CheckCircle2 size={30} />
                <p>{success}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="book-form">
                <label className="book-field">
                  <span>Patient name</span>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </label>

                <label className="book-field">
                  <span>WhatsApp number</span>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="e.g. 91XXXXXXXXXX"
                    required
                  />
                </label>

                <label className="book-field">
                  <span>Date</span>
                  <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
                    {upcomingDays.map((d) => (
                      <option key={d.dateIso} value={d.dateIso}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="book-field">
                  <span>Time slot</span>
                  {slotsLoading ? (
                    <p className="book-slots-loading">
                      <Loader2 size={14} className="spin" /> Loading availability…
                    </p>
                  ) : slots && slots.length > 0 ? (
                    <div className="book-slot-grid">
                      {slots.map((s) => {
                        const isSelected = selectedStart === s.start;
                        const unavailableLabel = s.busySource === "appointment" ? "Booked" : "Unavailable";
                        return (
                          <button
                            type="button"
                            key={s.start}
                            disabled={!s.available}
                            className={`book-slot${isSelected ? " book-slot--selected" : ""}${
                              !s.available ? " book-slot--disabled" : ""
                            }`}
                            onClick={() => setSelectedStart(s.start)}
                            title={s.available ? undefined : unavailableLabel}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-state">No slots found for this date.</p>
                  )}
                </div>

                <label className="book-field">
                  <span>Concern / reason (optional)</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Follow-up for hypertension"
                    rows={2}
                  />
                </label>

                {error && <p className="book-error">{error}</p>}

                <button type="submit" className="btn-primary book-submit" disabled={submitting || !selectedStart}>
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="spin" /> Booking…
                    </>
                  ) : (
                    "Confirm booking"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
