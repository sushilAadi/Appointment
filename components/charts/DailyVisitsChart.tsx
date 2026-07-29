import type { DailyVisitBucket } from "@/lib/dashboardStats";

// 30-day two-tone bar chart — dark segment for new patients (their first
// ever visit), lighter segment for returning patients, stacked per day.
export default function DailyVisitsChart({ days }: { days: DailyVisitBucket[] }) {
  const max = Math.max(1, ...days.map((d) => d.newCount + d.returningCount));
  // Label every ~5th day so the axis doesn't get crowded across 30 bars.
  const labelEvery = 5;

  return (
    <div className="daily-visits-chart">
      <div className="daily-visits-bars">
        {days.map((d, i) => {
          const total = d.newCount + d.returningCount;
          const totalPct = total === 0 ? 0 : Math.max(4, (total / max) * 100);
          const newPct = total === 0 ? 0 : (d.newCount / total) * 100;
          return (
            <div
              key={d.key}
              className="daily-visits-col"
              style={{ height: `${totalPct}%` }}
              title={`${d.label}: ${d.newCount} new, ${d.returningCount} returning`}
            >
              {d.newCount > 0 && <span className="daily-visits-seg new" style={{ height: `${newPct}%` }} />}
              {d.returningCount > 0 && (
                <span className="daily-visits-seg returning" style={{ height: `${100 - newPct}%` }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="daily-visits-axis">
        {days.map((d, i) =>
          i % labelEvery === 0 ? (
            <span key={d.key} className="daily-visits-axis-label">
              {d.label}
            </span>
          ) : (
            <span key={d.key} className="daily-visits-axis-label" aria-hidden="true" />
          )
        )}
      </div>
    </div>
  );
}
