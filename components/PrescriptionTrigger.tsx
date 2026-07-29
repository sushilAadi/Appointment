"use client";

// Wraps any trigger element (a schedule grid block, a "View prescription"
// pill on the patients page, etc.) with local open/close state for the
// shared PrescriptionPreview modal — kept generic so both call sites reuse
// the same modal without a page-level modal-manager/context.
import { useState, type ReactNode, type CSSProperties } from "react";
import PrescriptionPreview from "./PrescriptionPreview";

export interface PrescriptionTriggerProps {
  clientName: string;
  clientPhone: string;
  visitLabel: string;
  notes: string | null;
  photoUrl: string | null;
  slipUrl: string | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}

export default function PrescriptionTrigger({
  clientName,
  clientPhone,
  visitLabel,
  notes,
  photoUrl,
  slipUrl,
  className,
  style,
  title,
  children,
}: PrescriptionTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && (
        <PrescriptionPreview
          clientName={clientName}
          clientPhone={clientPhone}
          visitLabel={visitLabel}
          notes={notes}
          photoUrl={photoUrl}
          slipUrl={slipUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
