import "./globals.css";
import type { ReactNode } from "react";
import { CLINIC_NAME } from "@/lib/config";

export const metadata = {
  title: `${CLINIC_NAME} — Appointment Booking`,
  description: "WhatsApp-based doctor appointment booking",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
