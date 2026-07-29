import Image from "next/image";

// `name` is passed down from the server-component layout (see
// app/(dashboard)/layout.tsx) rather than read from lib/config directly —
// this file is imported by the "use client" TopNav, and only
// NEXT_PUBLIC_-prefixed env vars are available in the browser bundle, so
// reading CLINIC_NAME here would silently fall back to the default string
// and cause a server/client hydration mismatch (see globals.css history).
//
// The uploaded logo image already bakes in its own wordmark, so it replaces
// both the old icon mark AND the separate "logo-word" text — rendering both
// would duplicate the clinic name. `name` is kept as the alt text/aria-label
// for accessibility even though it's no longer shown as visible text.
export default function Logo({ name }: { name: string }) {
  return (
    <div className="logo">
      <Image
        src="/images/logo.png"
        alt={name}
        title={name}
        width={160}
        height={54}
        className="logo-image"
        priority
      />
    </div>
  );
}
