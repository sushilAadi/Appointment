import type { ReactNode } from "react";
import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";
import { CLINIC_NAME, DOCTOR_NAME } from "@/lib/config";

// Shared chrome (top nav + left icon rail) for every dashboard page. Lives
// in a route group so the appointments dashboard serves at "/" (this
// group's index route) while /patients and /schedule keep their own
// segments — all three share this layout, with no /dashboard URL prefix.
//
// CLINIC_NAME/DOCTOR_NAME are read here (a server component, so the real
// env values are available) and passed down as props to the "use client"
// TopNav — client components can't read these directly, since only
// NEXT_PUBLIC_-prefixed env vars are inlined into the browser bundle.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-shell">
      <TopNav clinicName={CLINIC_NAME} doctorName={DOCTOR_NAME} />
      <div className="dashboard-body">
        <Sidebar />
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
