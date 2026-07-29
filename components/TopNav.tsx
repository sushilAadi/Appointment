"use client";

import { Bell, Search, Mail } from "lucide-react";
import Logo from "./Logo";
import { initialsFor } from "@/lib/format";

// Minimal, transparent top bar — just the clinic logo on the left (aligned
// directly above the sidebar's icon column via .top-nav-brand's matching
// 64px width/12px inset) and a few global utilities on the right. Page
// navigation lives in the left icon rail (components/Sidebar.tsx), not
// a horizontal pill menu here — that was an earlier, explicit design
// decision ("top navbar should be transparent... left sidebar selected
// menu should fully circle background").
export default function TopNav({
  clinicName,
  doctorName,
}: {
  clinicName: string;
  doctorName: string;
}) {
  return (
    <header className="top-nav">
      <div className="top-nav-brand">
        <Logo name={clinicName} />
      </div>
      <div className="top-nav-spacer" />
      <div className="top-nav-actions">
        <button type="button" className="icon-btn" title="Search" aria-label="Search">
          <Search size={17} />
        </button>
        <button type="button" className="icon-btn" title="Messages" aria-label="Messages">
          <Mail size={17} />
        </button>
        <button type="button" className="icon-btn" title="Notifications" aria-label="Notifications">
          <Bell size={17} />
        </button>
        <span className="avatar" title={doctorName}>
          {initialsFor(doctorName)}
        </span>
      </div>
    </header>
  );
}
