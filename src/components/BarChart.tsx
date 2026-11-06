/** Flat brutalist bar chart: grey bars, the last (or chosen) one highlighted. */
export function BarChart({
  values,
  labels,
  height = 130,
  highlight,
  zero,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  highlight?: number; // index; default = last
  zero?: boolean; // start the scale at 0 (counts); otherwise just below the minimum so progress is visible
}) {
  const max = Math.max(1, ...values);
  const positive = values.filter((v) => v > 0);
  const floor = zero || positive.length < 2 ? 0 : Math.min(...positive) * 0.85;
  const hi = highlight ?? values.length - 1;
  return (
    <div>
      <div className="bars" style={{ height }}>
        {values.map((v, i) => (
          <i key={i} className={i === hi ? 'hi' : ''} style={{ height: `${Math.max(2, ((v - floor) / (max - floor || 1)) * 100)}%` }} title={String(v)} />
        ))}
      </div>
      {labels && (
        <div className="bars-labels m">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
