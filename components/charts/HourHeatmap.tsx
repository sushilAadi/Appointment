const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, matching hourHeatmap's Sun=0..Sat=6 indexing
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HEAT_CLASS = ["heat-0", "heat-1", "heat-2", "heat-3", "heat-4"];
const AXIS_HOURS = [0, 6, 12, 18];

function hourLabel(h: number): string {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${h < 12 ? "a" : "p"}`;
}

// Day-of-week x hour-of-day heatmap — one small square per hour, 24 hours x
// 7 days, colored on the same 5-level heat scale used elsewhere.
export default function HourHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());

  return (
    <div className="hour-heatmap">
      {DAY_ORDER.map((dayIndex, rowI) => (
        <div className="hour-heatmap-row" key={dayIndex}>
          <span className="hour-heatmap-row-label">{DAY_LABELS[rowI]}</span>
          <div className="hour-heatmap-cells">
            {grid[dayIndex].map((count, hour) => {
              const level = count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4));
              return (
                <span
                  key={hour}
                  className={`hour-heatmap-cell ${HEAT_CLASS[level]}`}
                  title={`${DAY_LABELS[rowI]} ${hourLabel(hour)}: ${count} appointment${count === 1 ? "" : "s"}`}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="hour-heatmap-axis">
        <span className="hour-heatmap-row-label" aria-hidden="true" />
        <div className="hour-heatmap-cells">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="hour-heatmap-axis-label">
              {AXIS_HOURS.includes(h) ? hourLabel(h) : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
