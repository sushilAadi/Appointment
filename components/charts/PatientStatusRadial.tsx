"use client";

import { EChartsRadialChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-radial-chart";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Replaces the old plain-SVG StatusDonut with an evilcharts/ECharts radial
// chart (per explicit request to install echarts + shadcn and use the
// EChartsCacheTiersRadialChart example as a base). All the appointment
// numbers are pre-computed server-side in app/(dashboard)/page.tsx (this is
// a client component, and lib/config's env-derived constants shouldn't ship
// to the browser bundle unless a component actually needs them).
//
// Colors reuse this app's existing --donut-confirmed/--donut-completed/
// --donut-cancelled tokens (globals.css) via var(...) references rather than
// new hardcoded hex values — those tokens are already theme-aware (they flip
// with html[data-theme="dark"]), so the ring colors stay correct in both
// themes with no extra plumbing.
export interface PatientStatusRadialProps {
  confirmed: number;
  completed: number;
  cancelled: number;
  uniquePatients: number;
  thisWeekTotal: number;
  newPatientsThisWeek: number;
  showUpRateThisWeek: number | null;
}

const STATUSES = [
  { name: "confirmed", label: "Confirmed", varName: "--donut-confirmed" },
  { name: "completed", label: "Completed", varName: "--donut-completed" },
  { name: "cancelled", label: "Cancelled", varName: "--donut-cancelled" },
] as const;

const chartConfig = {
  confirmed: { label: "Confirmed", colors: { light: ["var(--donut-confirmed)"], dark: ["var(--donut-confirmed)"] } },
  completed: { label: "Completed", colors: { light: ["var(--donut-completed)"], dark: ["var(--donut-completed)"] } },
  cancelled: { label: "Cancelled", colors: { light: ["var(--donut-cancelled)"], dark: ["var(--donut-cancelled)"] } },
} satisfies ChartConfig;

const count = (value: number) => value.toLocaleString("en-US");

function useCompactRing() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return compact;
}

export default function PatientStatusRadial({
  confirmed,
  completed,
  cancelled,
  uniquePatients,
  thisWeekTotal,
  newPatientsThisWeek,
  showUpRateThisWeek,
}: PatientStatusRadialProps) {
  const compact = useCompactRing();
  const total = confirmed + completed + cancelled;

  const counts: Record<(typeof STATUSES)[number]["name"], number> = {
    confirmed,
    completed,
    cancelled,
  };

  // Innermost ring first, matching the Recharts/ECharts twin's data-order
  // convention (index 0 = innermost) — reversed so the largest, most
  // "current" status (confirmed) reads as the outer ring.
  const chartData = [...STATUSES]
    .reverse()
    .map(({ name }) => ({ name, share: total > 0 ? (counts[name] / total) * 100 : 0 }));

  const stats = [
    { name: "patients", label: "Total patients", value: uniquePatients },
    { name: "week", label: "This week", value: thisWeekTotal },
    { name: "new", label: "New this week", value: newPatientsThisWeek },
    {
      name: "showup",
      label: "Show-up rate",
      value: showUpRateThisWeek,
      suffix: showUpRateThisWeek !== null ? "%" : "",
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1 sm:gap-3 sm:p-2">
      <div className="flex min-h-0 flex-1 gap-3 sm:gap-4">
        <div className="relative min-h-0 flex-1 sm:-mb-6">
          <EChartsRadialChart
            data={chartData}
            config={chartConfig}
            nameKey="name"
            variant="semi"
            max={100}
            innerRadius="38%"
            outerRadius="96%"
            className="h-full w-full"
          >
            <EChartsRadialChart.RadialBar
              dataKey="share"
              barSize={compact ? 7 : 13}
              cornerRadius={compact ? 4 : 7}
            />
            <EChartsRadialChart.Tooltip />
          </EChartsRadialChart>
        </div>
        <div className="grid shrink-0 grid-cols-2 content-center gap-x-4 gap-y-5 sm:w-[42%] sm:max-w-64">
          {stats.map(({ name, label, value, suffix }) => (
            <div key={name} className="flex flex-col gap-1">
              <span className="text-muted-foreground truncate text-xs sm:text-sm">{label}</span>
              <span className="text-primary text-lg leading-none font-medium tabular-nums sm:text-xl">
                {value === null ? "—" : `${count(value)}${suffix ?? ""}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-x-3 gap-y-2 border-t border-border pt-2 sm:gap-y-3 sm:pt-3">
        {STATUSES.map(({ name, label, varName }) => (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span
                className={cn("size-2.5 shrink-0 rounded-[3px]")}
                style={{ background: `var(${varName})` }}
              />
              <span className="text-primary truncate text-xs">{label}</span>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {count(counts[name])}/{count(total)} ({total > 0 ? Math.round((counts[name] / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
