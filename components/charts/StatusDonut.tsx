// Plain-SVG donut (no charting library) using the same status colors as the
// appointments table's badges (--success-text/--info-text/--danger-text),
// so the chart and the table always agree visually.
export default function StatusDonut({
  confirmed,
  completed,
  cancelled,
}: {
  confirmed: number;
  completed: number;
  cancelled: number;
}) {
  const total = confirmed + completed + cancelled;
  const size = 132;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { value: confirmed, colorVar: "--success-text" },
    { value: completed, colorVar: "--info-text" },
    { value: cancelled, colorVar: "--danger-text" },
  ];

  let offsetAcc = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((seg, i) => {
            if (seg.value === 0) return null;
            const dash = (seg.value / total) * circumference;
            const strokeDashoffset = -offsetAcc;
            offsetAcc += dash;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={`var(${seg.colorVar})`}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
      </svg>
      <div className="donut-center">
        <span className="donut-total">{total}</span>
        <span className="donut-total-label">total</span>
      </div>
    </div>
  );
}
