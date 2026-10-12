import { toDate } from "@/lib/dates";
import { niceStep } from "@/lib/format";

export type MonthBar = { id: string; name: string; color: string; v: (number | null)[] };

/** Side-by-side bars for each month, one bar per series, with the value on top of each bar. */
export default function MonthBars({ months, series, label, fmt }: { months: string[]; series: MonthBar[]; label: string; fmt: (v: number) => string }) {
  const W = 900, H = 260, pl = 52, pr = 12, pt = 22, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(0, ...series.flatMap((s) => s.v.filter((v): v is number => v != null)));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const y = (v: number) => pt + ih - (v / top) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const gw = iw / Math.max(1, months.length), bw = Math.min(26, (gw - 10) / series.length), gap = 3;
  const mlabel = (m: string, long = false) => toDate(m + "-01").toLocaleDateString("en-US", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" });
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{Math.round(v).toLocaleString("en-US")}</text></g>)}
        {months.map((m, i) => {
          const cx = pl + i * gw + gw / 2, group = series.length * bw + (series.length - 1) * gap;
          return (
            <g key={m}>
              <text x={cx} y={H - 8} textAnchor="middle">{mlabel(m)}</text>
              {series.map((s, j) => {
                const v = s.v[i];
                if (v == null) return null;
                const x = cx - group / 2 + j * (bw + gap);
                return (
                  <g key={s.id}>
                    <rect x={x} y={y(v)} width={bw} height={pt + ih - y(v)} rx="2" fill={`var(--${s.color})`}><title>{`${s.name}, ${mlabel(m, true)}: ${fmt(v)}`}</title></rect>
                    <text className="barval" x={x + bw / 2} y={y(v) - 5} textAnchor="middle">{Math.round(v).toLocaleString("en-US")}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
