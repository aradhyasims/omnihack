// Single-series vertical bar chart (SVG). One hue (brand-600, validated against the light surface),
// 4px rounded tops anchored to the baseline, recessive grid, hover tooltip via enlarged hit targets,
// and a table view so values are never color/hover-only.
type Datum = { label: string; value: number };

export function BarChart({ data, title, valueLabel = "Count", height = 180 }: { data: Datum[]; title: string; valueLabel?: string; height?: number }) {
  if (!data.length) return <p className="text-sm text-ink-500">No data for this period.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = [0, Math.ceil(max / 2), max];
  const w = Math.max(320, data.length * 28);
  const padL = 32;
  const padB = 22;
  const plotH = height - padB - 8;
  const slot = (w - padL) / data.length;
  const barW = Math.min(28, slot - 2);
  const y = (v: number) => 8 + plotH - (v / max) * plotH;
  const every = Math.ceil(data.length / 8);
  return (
    <figure>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${height}`}
          className="h-auto w-full min-w-[320px]"
          role="img"
          aria-label={`${title}: bar chart, ${data.length} bars, maximum ${max}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="#eceef6" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-400 text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            const top = y(d.value);
            const h = 8 + plotH - top;
            return (
              <g key={d.label} className="group">
                <title>{`${d.label}: ${d.value} ${valueLabel.toLowerCase()}`}</title>
                <rect x={padL + i * slot} y={8} width={slot} height={plotH} fill="transparent" />
                {h > 0 ? (
                  <path
                    d={`M${x},${8 + plotH} V${top + Math.min(4, h)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${8 + plotH} Z`}
                    fill="#4F46E5"
                    className="transition-opacity group-hover:opacity-80"
                  />
                ) : null}
                {i % every === 0 ? (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-ink-400 text-[10px]">
                    {d.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={padL} x2={w} y1={8 + plotH} y2={8 + plotH} stroke="#b6bbd2" strokeWidth={1} />
        </svg>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-semibold text-ink-500">Show table</summary>
        <table className="table-om mt-2">
          <thead>
            <tr>
              <th>Label</th>
              <th className="text-right">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal labelled bars for part-of-whole comparisons (values always printed as text). */
export function HBarList({ data, total }: { data: Datum[]; total?: number }) {
  const max = total ?? Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-ink-500">No data.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate text-ink-700">{d.label}</span>
            <span className="font-semibold tabular-nums text-ink-900">{d.value}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
