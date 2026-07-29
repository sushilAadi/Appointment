"use client";

import { usePathname } from "next/navigation";
import { Calendar, ClipboardList, Users } from "lucide-react";

// "Appointments" is the dashboard home page, served at "/" (see
// app/(dashboard)/page.tsx), not "/appointments".
const RAIL_ITEMS = [
  { href: "/", label: "Appointments", icon: ClipboardList },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: Calendar },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="side-rail">
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        // "/" needs an exact match — startsWith("/") would match every
        // route and leave the Appointments icon permanently "active".
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
