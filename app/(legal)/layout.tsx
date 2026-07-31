import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { CLINIC_NAME } from "@/lib/config";

// Shared chrome for the public legal pages (/privacy, /terms, /support,
// /data-deletion). Deliberately its own route group, separate from
// (dashboard) — these pages are read by patients, prospective clinics, and
// Meta's app review, none of whom should see the internal sidebar/top-nav.
// A plain header with the clinic logo and links between the four pages is
// all they need.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link href="/" aria-label="Back to dashboard">
          <Logo name={CLINIC_NAME} />
        </Link>
        <nav className="legal-nav">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/data-deletion">Data Deletion</Link>
          <Link href="/support">Support</Link>
        </nav>
      </header>
      <main className="legal-main">
        <div className="legal-content container">{children}</div>
      </main>
      <footer className="legal-footer">
        &copy; {new Date().getFullYear()} {CLINIC_NAME}
      </footer>
    </div>
  );
}
