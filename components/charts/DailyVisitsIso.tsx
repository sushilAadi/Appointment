"use client";

import type { DailyVisitBucket } from "@/lib/dashboardStats";
import { IsometricBarChart } from "@/components/evilcharts/charts/isometric-bar-chart";

// Replaces the old two-tone stacked DailyVisitsChart with the evilcharts
// isometric bar chart (per request to reuse that visual style across the
// dashboard's chart panels). The new/returning split is folded into a single
// per-day total here — the isometric chart is single-series by design — but
// each day's exact new/returning breakdown is still visible in the tooltip.
export default function DailyVisitsIso({ days }: { days: DailyVisitBucket[] }) {
  const data = days.map((d) => ({ label: d.label, value: d.newCount + d.returningCount }));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0] ?? { label: "—", value: 0 });

  return (
    <IsometricBarChart
      data={data}
      seriesKey="appointments"
      seriesLabel="Appointments"
      totalLabel="Total (30d)"
      totalDisplay={total.toLocaleString()}
      peakLabel="Peak day"
      peakDisplay={peak.label}
      cornerReadout={["30 DAYS", "PEAK DAY"]}
      valueSuffix=""
    />
  );
}
