import { niceStep } from "@/lib/format";

/** Colours for the biggest groups, shared by the chart, the table dots and the doughnut; everything smaller is grey. */
export const PALETTE = ["var(--s1)", "var(--s2)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)", "var(--s3)"];
export const OTHER = "var(--s4)";

export type Series = { key: string; label: string; color: string };

/** `totals` is the true hours in each bar. Leave it out when the stacks add up to it; pass it when an entry can sit in more than one stack (several tags), so the figure above a bar still counts every entry once. */
export function BarChart({ keys, data, series, unit, lbl, f, empty, totals }: { keys: string[]; data: Record<string, Record<string, number>>; series: Series[]; unit: string; lbl: (k: string) => string; f: (m: number) => string; empty: boolean; totals?: Record<string, number> }) {
  const W = 900, H = 272, pl = 52, pr = 8, pt = 12, pb = 50, iw = W - pl - pr, ih = H - pt - pb;
  const tot = (k: string) => Object.values(data[k] ?? {}).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...keys.map(tot));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => pt + ih - (v / top) * ih;
  const bw = iw / Math.max(1, keys.length), gap = Math.min(10, bw * 0.25), every = Math.ceil(keys.length / 10), showTotals = keys.length <= 16;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hours per ${unit}`}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={v ? "2 3" : undefined} /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{v}h</text></g>)}
        {keys.map((k, i) => {
          const x = pl + i * bw + gap / 2, w = Math.max(1, bw - gap);
          let acc = 0;
          return (
            <g key={k}>
              {series.map((s) => {
                const v = data[k]?.[s.key] ?? 0;
                if (v <= 0) return null;
                const r = <rect key={s.key} x={x} y={y(acc + v)} width={w} height={Math.max(0.5, y(acc) - y(acc + v))} fill={s.color} stroke={series.length > 1 ? "var(--tile)" : undefined} strokeWidth={series.length > 1 ? 1 : undefined} rx={series.length === 1 ? Math.min(3, w / 3) : 0}><title>{`${lbl(k)}: ${s.label}, ${v.toFixed(1)} h`}</title></rect>;
                acc += v;
                return r;
              })}
              {showTotals && <text x={x + w / 2} y={H - 26} textAnchor="middle" className="ctot">{f((totals ? totals[k] ?? 0 : tot(k)) * 60)}</text>}
              {i % every === 0 && <text x={x + w / 2} y={H - 8} textAnchor="middle">{lbl(k)}</text>}
            </g>
          );
        })}
      </svg>
      {empty && <div className="chart-empty"><b>No data to show</b><span>Try adjusting the filters to get some results.</span></div>}
    </div>
  );
}

export function Donut({ slices, total, centre }: { slices: { key: string; label: string; value: number; color: string }[]; total: number; centre: string }) {
  const R = 72, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <>
      <svg viewBox="0 0 200 200" role="img" aria-label="Share of hours">
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--track)" strokeWidth="30" />
        {slices.map((s) => {
          const len = (s.value / total) * C, el = (
            <circle key={s.key} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="30" strokeDasharray={`${Math.max(0, len - 1)} ${C - Math.max(0, len - 1)}`} strokeDashoffset={-off} transform="rotate(-90 100 100)">
              <title>{`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}</title>
            </circle>
          );
          off += len;
          return el;
        })}
        <text x="100" y="98" textAnchor="middle" className="dn-t">{centre}</text>
        <text x="100" y="116" textAnchor="middle" className="dn-s">total hours</text>
      </svg>
      <ul className="dn-leg">
        {slices.map((s) => <li key={s.key}><i className="dot" style={{ background: s.color }} /><span>{s.label}</span><b>{((s.value / total) * 100).toFixed(0)}%</b></li>)}
      </ul>
    </>
  );
}
