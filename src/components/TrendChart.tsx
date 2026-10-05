import { toDate } from "@/lib/dates";
import { niceStep, pct } from "@/lib/format";

export type TrendSeries = { id: string; name: string; color: string; v: (number | null)[] };
type Props = {
  months: string[]; series: TrendSeries[]; label: string;
  /** "pct": values are shares (0.75 is 75%). "hours": values are hours. */
  unit?: "pct" | "hours";
  /** How a value reads in the hover text. */
  fmt?: (v: number) => string;
  /** A dashed line at a set level, such as a client's contracted hours. */
  level?: { value: number; label: string; title: string };
};

/** One line per series across months, named at its right end. */
export default function TrendChart({ months, series, label, unit = "pct", fmt = pct, level }: Props) {
  const W = 900, H = 250, pl = 44, pr = 90, pt = 14, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(unit === "pct" ? 1 : 0, level?.value ?? 0, ...series.flatMap((s) => s.v.filter((v): v is number => v != null)));
  const step = unit === "pct" ? 0.25 : niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const x = (i: number) => pl + i * (iw / Math.max(1, months.length - 1)), y = (v: number) => pt + ih - (v / top) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const lines = series.map((s) => ({ s, pts: s.v.map((v, i) => (v == null ? null : ([x(i), y(v), v, i] as const))).filter((p): p is readonly [number, number, number, number] => !!p) }));
  const labels = [
    ...lines.filter((l) => l.pts.length).map((l) => { const last = l.pts[l.pts.length - 1]; return { id: l.s.id, text: l.s.name, x: last[0] + 10, y: last[1] }; }),
    ...(level ? [{ id: "level", text: level.label, x: W - pr + 10, y: y(level.value) }] : []),
  ].sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
  const mlabel = (m: string, long = false) => toDate(m + "-01").toLocaleDateString("en-US", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{unit === "pct" ? `${Math.round(v * 100)}%` : v.toLocaleString("en-US")}</text></g>)}
        {months.map((m, i) => <text key={m} x={x(i)} y={H - 8} textAnchor="middle">{mlabel(m)}</text>)}
        {level && <line className="level" x1={pl} x2={W - pr} y1={y(level.value)} y2={y(level.value)} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="6 4"><title>{level.title}</title></line>}
        {lines.map(({ s, pts }) => (
          <g key={s.id}>
            <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(" ")} fill="none" stroke={`var(--${s.color})`} strokeWidth="2" strokeLinejoin="round" />
            {pts.map((p) => <circle key={p[3]} cx={p[0]} cy={p[1]} r="4" fill={`var(--${s.color})`} stroke="var(--surface)" strokeWidth="2"><title>{`${s.name}, ${mlabel(months[p[3]], true)}: ${fmt(p[2])}`}</title></circle>)}
          </g>
        ))}
        {labels.map((o) => <text key={o.id} x={o.x} y={o.y + 4} style={{ fill: "var(--ink)" }}>{o.text}</text>)}
      </svg>
    </div>
  );
}
