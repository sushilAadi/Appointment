"use client";

import { useState } from "react";
import type { TopPatient } from "@/lib/dashboardStats";
import { IsometricBarChart } from "@/components/evilcharts/charts/isometric-bar-chart";

// Replaces the old plain-CSS "Top patients" progress-bar list with the
// evilcharts isometric bar chart. Only shows however many patients actually
// have completed visits (still capped at 5 by getDashboardStats) — this is
// a visual change, not a data change, so a short list (e.g. only 3 patients)
// is expected and correct until more patients accumulate completed visits.
//
// Clicking a bar selects that patient — the "Top patient" readout switches
// to show whoever is selected (falling back to the actual top patient by
// visit count when nothing is selected).
export default function TopPatientsIso({ patients }: { patients: TopPatient[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const data = patients.map((p) => ({ label: p.name.split(" ")[0] ?? p.name, value: p.visits }));
  const total = data.reduce((sum, p) => sum + p.value, 0);
  const topPatient = patients.reduce((best, p) => (p.visits > best.visits ? p : best), patients[0]);
  const activePatient = selectedIndex != null ? patients[selectedIndex] : topPatient;

  return (
    <IsometricBarChart
      data={data}
      seriesKey="visits"
      seriesLabel="Visits"
      totalLabel="Total visits"
      totalDisplay={total.toLocaleString()}
      peakLabel={selectedIndex != null ? "Selected" : "Top patient"}
      peakDisplay={activePatient.name.split(" ")[0] ?? activePatient.name}
      valueSuffix=" visits"
      selectedIndex={selectedIndex}
      onSelectIndex={setSelectedIndex}
    />
  );
}
