"use client";
import { niceStep } from "@/lib/format";
import { monthLabel, useChartWidth } from "./TrendChart";

export type MonthBar = { id: string; name: string; color: string; v: (number | null)[] };

const hours = (v: number) => Math.round(v).toLocaleString("en-US");

/** Side-by-side bars for each month, one bar per series, with the value on top of each bar (values are hours). In a box too narrow for the
 *  values to sit side by side (a tablet or phone), each month becomes a row of bars that run across, with the value at the end of each bar.
 *  `under` is an optional line of text for each month (such as a percentage), shown under the month's name. */
export default function MonthBars({ months, series, label, under }: { months: string[]; series: MonthBar[]; label: string; under?: (string | null)[] }) {
  const [ref, W] = useChartWidth(900);
  const max = Math.max(0, ...series.flatMap((s) => s.v.filter((v): v is number => v != null)));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const title = (s: MonthBar, m: string, v: number) => <title>{`${s.name}, ${monthLabel(m, true)}: ${hours(v)} h`}</title>;

  if (W < 760) {
    const lw = 40, vr = 50, pt = 4, pb = 24, bh = 10, bg = 3, rowGap = 10;
    const group = series.length * bh + (series.length - 1) * bg, pitch = group + rowGap;
    const ih = months.length * pitch - rowGap, H = pt + ih + pb, iw = W - lw - vr;
    const x = (v: number) => lw + (v / top) * iw;
    return (
      <div className="chart" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {ticks.map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={pt} y2={pt + ih} stroke="var(--line)" /><text x={x(v)} y={H - 6} textAnchor="middle">{hours(v)}</text></g>)}
          {months.map((m, i) => {
            const y0 = pt + i * pitch;
            return (
              <g key={m}>
                <text x={lw - 8} y={y0 + group / 2 + (under?.[i] != null ? -2 : 4)} textAnchor="end">{monthLabel(m)}</text>
                {under?.[i] != null && <text className="cpct" x={lw - 8} y={y0 + group / 2 + 11} textAnchor="end">{under[i]}</text>}
                {series.map((s, j) => {
                  const v = s.v[i];
                  if (v == null) return null;
                  const y = y0 + j * (bh + bg);
                  return (
                    <g key={s.id}>
                      <rect x={lw} y={y} width={Math.max(0, x(v) - lw)} height={bh} rx="2" fill={`var(--${s.color})`}>{title(s, m, v)}</rect>
                      <text className="barval" x={x(v) + 5} y={y + bh / 2 + 4} style={{ fontSize: 11 }}>{hours(v)}</text>
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

  const H = Math.max(220, Math.round((W * 260) / 900)), pl = 52, pr = 12, pt = 22, pb = under ? 44 : 28, iw = W - pl - pr, ih = H - pt - pb;
  const y = (v: number) => pt + ih - (v / top) * ih;
  const gw = iw / Math.max(1, months.length), bw = Math.min(26, (gw - 10) / series.length), gap = 3;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{hours(v)}</text></g>)}
        {months.map((m, i) => {
          const cx = pl + i * gw + gw / 2, group = series.length * bw + (series.length - 1) * gap;
          return (
            <g key={m}>
              <text x={cx} y={H - (under?.[i] != null ? 24 : 8)} textAnchor="middle">{monthLabel(m)}</text>
              {under?.[i] != null && <text className="cpct" x={cx} y={H - 8} textAnchor="middle">{under[i]}</text>}
              {series.map((s, j) => {
                const v = s.v[i];
                if (v == null) return null;
                const x = cx - group / 2 + j * (bw + gap);
                return (
                  <g key={s.id}>
                    <rect x={x} y={y(v)} width={bw} height={pt + ih - y(v)} rx="2" fill={`var(--${s.color})`}>{title(s, m, v)}</rect>
                    <text className="barval" x={x + bw / 2} y={y(v) - 5} textAnchor="middle">{hours(v)}</text>
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
