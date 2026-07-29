import { Stethoscope } from "lucide-react";

// `name` is passed down from the server-component layout (see
// app/(dashboard)/layout.tsx) rather than read from lib/config directly —
// this file is imported by the "use client" TopNav, and only
// NEXT_PUBLIC_-prefixed env vars are available in the browser bundle, so
// reading CLINIC_NAME here would silently fall back to the default string
// and cause a server/client hydration mismatch (see globals.css history).
export default function Logo({ name }: { name: string }) {
  return (
    <div className="logo">
      <span className="logo-mark">
        <Stethoscope size={18} />
      </span>
      <span className="logo-word">{name}</span>
    </div>
  );
}
