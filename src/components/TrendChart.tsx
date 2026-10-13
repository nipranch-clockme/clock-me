"use client";
import { useEffect, useRef, useState } from "react";
import { toDate } from "@/lib/dates";
import { fmtHours, niceStep, pct, type TimeFormat } from "@/lib/format";

export type TrendSeries = { id: string; name: string; color: string; v: (number | null)[]; /** Draw the line dashed, for a plan or contract next to what really happened. */ dashed?: boolean };
type Props = {
  months: string[]; series: TrendSeries[]; label: string;
  /** "pct": values are shares (0.75 is 75%). "hours": values are hours. */
  unit?: "pct" | "hours";
  /** How hours read in the hover text (unit "hours" only). */
  timeFormat?: TimeFormat;
  /** A dashed line at a set level, such as a client's contracted hours. */
  level?: { value: number; label: string; title: string };
};

/** The width a chart is drawn at: its box's width in pixels, so its text keeps its real size on a tablet or phone. A box wider than `full`
 *  (and the first render, before the box is measured) draws at `full` and scales up to fit, as on a desktop. */
export function useChartWidth(full: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setW(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w > 0 && w < full ? Math.max(240, w) : full] as const;
}

export const monthLabel = (m: string, long = false) => toDate(m + "-01").toLocaleDateString("en-US", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });

/** One line per series across months, named at its right end. In a narrow box the names are left to the legend under the chart, and only
 *  every other month may be labelled, so the plot keeps its room and the text stays readable. */
export default function TrendChart({ months, series, label, unit = "pct", timeFormat = "decimal", level }: Props) {
  const [ref, W] = useChartWidth(900);
  const compact = W < 640;
  const fmt = (v: number) => (unit === "pct" ? pct(v) : `${fmtHours(v * 60, timeFormat)} h`);
  const short = (t: string) => (t.length > 24 ? t.slice(0, 23) + "…" : t);
  const longest = Math.max(0, ...series.map((s) => short(s.name).length), level ? level.label.length : 0);
  const H = Math.max(200, Math.round((W * 250) / 900)), pl = 44, pr = compact ? 16 : Math.min(200, Math.max(100, 32 + longest * 6.6)), pt = 14, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(unit === "pct" ? 1 : 0, level?.value ?? 0, ...series.flatMap((s) => s.v.filter((v): v is number => v != null)));
  const step = unit === "pct" ? 0.25 : niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const gap = iw / Math.max(1, months.length - 1);
  const x = (i: number) => pl + i * gap, y = (v: number) => pt + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(36 / gap)); // month names at least 36px apart, always naming the latest month
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const lines = series.map((s) => ({ s, pts: s.v.map((v, i) => (v == null ? null : ([x(i), y(v), v, i] as const))).filter((p): p is readonly [number, number, number, number] => !!p) }));
  const labels = compact ? [] : [
    ...lines.filter((l) => l.pts.length).map((l) => { const last = l.pts[l.pts.length - 1]; return { id: l.s.id, text: l.s.name, color: `var(--${l.s.color})`, x: last[0] + 12, y: last[1], endY: last[1] }; }),
    ...(level ? [{ id: "level", text: level.label, color: "var(--muted)", x: W - pr + 12, y: y(level.value), endY: y(level.value) }] : []),
  ].sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
  for (let i = labels.length - 1; i >= 0; i--) { const room = H - pb - 2 - (labels.length - 1 - i) * 15; if (labels[i].y > room) labels[i].y = room; } // keep the names inside the chart when many lines end low
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{unit === "pct" ? `${Math.round(v * 100)}%` : v.toLocaleString("en-US")}</text></g>)}
        {months.map((m, i) => (months.length - 1 - i) % every === 0 && <text key={m} x={x(i)} y={H - 8} textAnchor="middle">{monthLabel(m)}</text>)}
        {level && <line className="level" x1={pl} x2={W - pr} y1={y(level.value)} y2={y(level.value)} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="6 4"><title>{level.title}</title></line>}
        {lines.map(({ s, pts }) => (
          <g key={s.id}>
            <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(" ")} fill="none" stroke={`var(--${s.color})`} strokeWidth="2" strokeLinejoin="round" strokeDasharray={s.dashed ? "6 4" : undefined} />
            {pts.map((p) => <circle key={p[3]} cx={p[0]} cy={p[1]} r="4" fill={`var(--${s.color})`} stroke="var(--surface)" strokeWidth="2"><title>{`${s.name}, ${monthLabel(months[p[3]], true)}: ${fmt(p[2])}`}</title></circle>)}
          </g>
        ))}
        {/* Each name gets a dot in its line's colour and a short leader back to where the line ends, so a name stays tied to its line when names have to be spread apart. The words stay in the normal text colour so they are easy to read. */}
        {labels.map((o) => (
          <g key={o.id}>
            <line x1={W - pr + 4} y1={o.endY} x2={o.x - 5} y2={o.y} stroke={o.color} strokeWidth="1" />
            <circle cx={o.x} cy={o.y} r="4" fill={o.color} />
            <text x={o.x + 9} y={o.y + 4} style={{ fill: "var(--ink)" }}>{short(o.text)}<title>{o.text}</title></text>
          </g>
        ))}
      </svg>
    </div>
  );
}
