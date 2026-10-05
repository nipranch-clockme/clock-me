import { toDate } from "@/lib/dates";
import { pct } from "@/lib/format";

/** A line per series of monthly percentages (null where there's nothing to show), with each line's name at its end. */
export default function TrendChart({ months, series, label }: { months: string[]; series: { id: string; name: string; color: string; v: (number | null)[] }[]; label: string }) {
  const W = 900, H = 250, pl = 44, pr = 90, pt = 14, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...series.flatMap((s) => s.v.filter((v): v is number => v != null)));
  const top = Math.ceil(max * 4) / 4;
  const x = (i: number) => pl + i * (iw / 11), y = (v: number) => pt + ih - (v / top) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += 0.25) ticks.push(v);
  const lines = series.map((s) => ({ s, pts: s.v.map((v, i) => (v == null ? null : ([x(i), y(v), v] as const))).filter((p): p is readonly [number, number, number] => !!p) }));
  const labels = lines.filter((l) => l.pts.length).map((l) => ({ l, y: l.pts[l.pts.length - 1][1] })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
  const mlabel = (m: string, long = false) => toDate(m + "-01").toLocaleDateString("en-US", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text></g>)}
        {months.map((m, i) => <text key={m} x={x(i)} y={H - 8} textAnchor="middle">{mlabel(m)}</text>)}
        {lines.map(({ s, pts }) => (
          <g key={s.id}>
            <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(" ")} fill="none" stroke={`var(--${s.color})`} strokeWidth="2" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={`var(--${s.color})`} stroke="var(--surface)" strokeWidth="2"><title>{`${s.name}, ${mlabel(months[s.v.findIndex((_, j) => x(j) === p[0])], true)}: ${pct(p[2])}`}</title></circle>)}
          </g>
        ))}
        {labels.map((o) => { const last = o.l.pts[o.l.pts.length - 1]; return <text key={o.l.s.id} x={last[0] + 10} y={o.y + 4} style={{ fill: "var(--ink)" }}>{o.l.s.name}</text>; })}
      </svg>
    </div>
  );
}
