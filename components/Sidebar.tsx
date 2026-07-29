"use client";

import { usePathname } from "next/navigation";
import { Calendar, ClipboardList, Users } from "lucide-react";

// "Dashboard" is the home page, served at "/" (see app/(dashboard)/page.tsx).
// "Appointment" is the booking/calendar page, served at "/schedule".
const RAIL_ITEMS = [
  { href: "/", label: "Dashboard", icon: ClipboardList },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/schedule", label: "Appointment", icon: Calendar },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="side-rail">
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        // "/" needs an exact match — startsWith("/") would match every
        // route and leave the Dashboard icon permanently "active".
        const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            className={`side-rail-icon is-link${active ? " active" : ""}`}
            data-tooltip={item.label}
            aria-label={item.label}
          >
            <Icon size={19} />
          </a>
        );
      })}
      <div className="side-rail-spacer" />
    </aside>
  );
}
