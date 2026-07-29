import "./globals.css";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { CLINIC_NAME } from "@/lib/config";
import GrainientBackground from "@/components/GrainientBackground";

// Poppins, all 9 weights x normal/italic, served via next/font/local from
// the @fontsource/poppins package's font files (an npm dependency, so `npm
// install` is all a build needs — no fetch to fonts.googleapis.com at build
// time the way next/font/google works, which matters in network-restricted
// build environments). Self-hosted either way; no runtime request to
// Google's CDN, no font-swap flash. Exposed as a CSS variable so
// globals.css and the .poppins-* weight utility classes can reference it.
//
// next/font's build-time plugin statically parses this call without
// evaluating JS, so every `path` must be a plain string literal — no
// template interpolation, map/flatMap, or outer-scope constants. Hence
// spelling out all 18 weight/style combinations by hand.
const poppins = localFont({
  src: [
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-100-normal.woff2", weight: "100", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-100-italic.woff2", weight: "100", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-200-normal.woff2", weight: "200", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-200-italic.woff2", weight: "200", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-600-italic.woff2", weight: "600", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-700-italic.woff2", weight: "700", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-800-normal.woff2", weight: "800", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-800-italic.woff2", weight: "800", style: "italic" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-900-normal.woff2", weight: "900", style: "normal" },
    { path: "../node_modules/@fontsource/poppins/files/poppins-latin-900-italic.woff2", weight: "900", style: "italic" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

// DM Serif Text — normal + italic, weight 400 only (it doesn't ship other
// weights). Used for headings/titles per globals.css's --font-title;
// everything else stays on the Poppins scale above.
const dmSerifText = localFont({
  src: [
    { path: "../node_modules/@fontsource/dm-serif-text/files/dm-serif-text-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/dm-serif-text/files/dm-serif-text-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-title",
  display: "swap",
});

export const metadata = {
  title: `${CLINIC_NAME} — Appointment Booking`,
  description: "WhatsApp-based doctor appointment booking",
};

// Inline, pre-hydration script that applies the saved theme before first
// paint — avoids a light-theme flash for users who saved "dark".
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = window.localStorage.getItem("dashboard-theme");
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${dmSerifText.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <GrainientBackground />
        {children}
      </body>
    </html>
  );
}
