"use client";

// Shared "preview prescription" modal for a COMPLETED appointment — used
// from both the schedule grid (clicking a completed block) and the
// patients directory (a patient's visit history). Renders only what's
// actually on the appointment record; no fabricated Rx content.
import { useEffect } from "react";
import { X, FileText, Download } from "lucide-react";

export interface PrescriptionPreviewProps {
  clientName: string;
  clientPhone: string;
  visitLabel: string; // pre-formatted date + time range
  notes: string | null;
  photoUrl: string | null;
  slipUrl: string | null;
  onClose: () => void;
}

export default function PrescriptionPreview({
  clientName,
  clientPhone,
  visitLabel,
  notes,
  photoUrl,
  slipUrl,
  onClose,
}: PrescriptionPreviewProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasContent = Boolean(notes || photoUrl || slipUrl);

  return (
    <div className="rx-modal-backdrop" onClick={onClose}>
      <div className="rx-modal" role="dialog" aria-modal="true" aria-label={`Prescription for ${clientName}`} onClick={(e) => e.stopPropagation()}>
        <div className="rx-modal-header">
          <div>
            <p className="rx-modal-eyebrow">Prescription</p>
            <h2>{clientName}</h2>
            <p className="rx-modal-meta">
              +{clientPhone} · {visitLabel}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rx-modal-body">
          {!hasContent && <p className="empty-state">No prescription details were recorded for this visit.</p>}

          {notes && (
            <div className="rx-notes">
              <h3>Notes</h3>
              <p>{notes}</p>
            </div>
          )}

          {photoUrl && (
            <div className="rx-photo">
              <h3>Prescription photo</h3>
              {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local/optimizable asset */}
              <img src={photoUrl} alt={`Prescription photo for ${clientName}`} />
            </div>
          )}

          {slipUrl && (
            <a className="rx-slip-link" href={slipUrl} target="_blank" rel="noopener noreferrer">
              <FileText size={15} />
              View signed prescription slip
              <Download size={13} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
