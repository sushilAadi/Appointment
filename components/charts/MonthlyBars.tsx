import type { MonthBucket } from "@/lib/dashboardStats";

// 12-month bar chart, this calendar year — the busiest month is
// highlighted (accent color), the rest are muted.
export default function MonthlyBars({ months }: { months: MonthBucket[] }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  const peakIndex = months.reduce((best, m, i) => (m.count > months[best].count ? i : best), 0);

  return (
    <div className="monthly-bars">
      {months.map((m, i) => (
        <div className="monthly-bars-col" key={m.key} title={`${m.label}: ${m.count} appointments`}>
          <span
            className={`monthly-bars-bar${i === peakIndex && m.count > 0 ? " peak" : ""}`}
            style={{ height: `${m.count === 0 ? 3 : Math.max(6, (m.count / max) * 100)}%` }}
          />
          <span className="monthly-bars-label">{m.label}</span>
        </div>
      ))}
    </div>
  );
}
