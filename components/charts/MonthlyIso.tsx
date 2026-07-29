"use client";

import type { MonthBucket } from "@/lib/dashboardStats";
import { IsometricBarChart } from "@/components/evilcharts/charts/isometric-bar-chart";

// Replaces the old MonthlyBars plain-CSS chart with the evilcharts isometric
// bar chart, driven by this year's real monthly appointment totals.
export default function MonthlyIso({ months }: { months: MonthBucket[] }) {
  const data = months.map((m) => ({ label: m.label, value: m.count }));
  const total = data.reduce((sum, m) => sum + m.value, 0);
  const peak = data.reduce((best, m) => (m.value > best.value ? m : best), data[0] ?? { label: "—", value: 0 });

  return (
    <IsometricBarChart
      data={data}
      seriesKey="appointments"
      seriesLabel="Appointments"
      totalLabel="Total this year"
      totalDisplay={total.toLocaleString()}
      peakLabel="Peak month"
      peakDisplay={peak.label}
      cornerReadout={["THIS YEAR", "PEAK MONTH"]}
      xAxisFormatter={(value) => value.slice(0, 3)}
      valueSuffix=""
    />
  );
}
