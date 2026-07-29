import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui helper — merges conditional class lists and resolves
// conflicting Tailwind utilities (e.g. "p-2 p-4" -> "p-4"). Used only by the
// evilcharts/Tailwind-based components under components/evilcharts/ and
// components/charts/PatientStatusRadial.tsx; nothing else in this app's
// plain-CSS design system needs it.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
