// Tiny bar sparkline for a KPI card — plain CSS bars, no charting library.
export default function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="sparkline">
      {values.map((v, i) => (
        <span key={i} className="sparkline-bar" style={{ height: `${Math.max(10, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}
