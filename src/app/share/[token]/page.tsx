import { cache } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { THEME_COOKIE, themeOf } from "@/lib/themes";
import { clientIp, takeAttempt } from "@/lib/throttle";
import { DAYS, RANGES, addDays, dow, longDate, monday, shortDate, today, toDate } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { stepRange } from "@/lib/report";
import { NO_TAG, SHARE_PATH, clientByShareToken, noteShareViewed, parseShareParams, shareChoices, shareQuery, shareRows } from "@/lib/clientShare";
import AutoForm from "@/components/AutoForm";
import ExportMenu from "@/components/ExportMenu";
import FilterMenu from "@/components/FilterMenu";
import ReportTable, { type RRow } from "@/components/ReportTable";
import ThemeToggle from "@/components/ThemeToggle";
import { BarChart, Donut, OTHER, PALETTE } from "@/components/ReportCharts";
import { Dot, Ifld } from "@/components/ui";

const getClient = cache(clientByShareToken);

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const client = await getClient((await params).token);
  return { title: client ? `${client.name}: time report` : "Time report", robots: { index: false, follow: false } };
}

/** A client's view-only report: hours per project and tag, with filters. No login; the link's secret is the way in. */
export default async function SharedReport({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const client = await getClient(token);
  if (!client) {
    // A wrong secret looks the same as a link that was turned off. Someone trying many wrong ones is slowed down.
    const { allowed } = await takeAttempt([[`share:${await clientIp()}`, 30]]);
    if (!allowed) return <main className="shpg"><p className="empty" role="alert">Too many attempts. Please wait a few minutes and try again.</p></main>;
    notFound();
  }
  const settings = await getSettings(); // also sets the company time zone, which decides today's date
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  const p = parseShareParams(await searchParams);
  try { await noteShareViewed(client.id); } catch { /* remembering the visit is best effort */ }

  const choices = await shareChoices(client.id);
  const keep = (v: string[], ok: string[]) => v.filter((x) => ok.includes(x));
  p.project = keep(p.project, choices.projects.map((x) => x.id));
  p.tag = keep(p.tag, choices.tags.map((x) => x.id));
  const { rows, from, to } = await shareRows(client, p);

  const P = new Map(choices.projects.map((x) => [x.id, x.archived ? `${x.name} (archived)` : x.name]));
  const T = new Map(choices.tags.map((x) => [x.id, x.name]));
  const keyOf = (g: "project" | "tag", r: { projectId: string; tagId: string | null }) => (g === "project" ? r.projectId : r.tagId ?? NO_TAG);
  const labelOf = (g: "project" | "tag", k: string) => (g === "project" ? P.get(k) : T.get(k)) ?? (g === "tag" ? "No tag" : "Project");
  const other = p.by === "project" ? "tag" : "project";

  const total = rows.reduce((a, r) => a + r.minutes, 0);
  type Node = { m: number; kids: Map<string, number> };
  const tree = new Map<string, Node>();
  for (const r of rows) {
    const n = tree.get(keyOf(p.by, r)) ?? { m: 0, kids: new Map() };
    n.m += r.minutes;
    const k2 = keyOf(other, r);
    n.kids.set(k2, (n.kids.get(k2) ?? 0) + r.minutes);
    tree.set(keyOf(p.by, r), n);
  }
  const sorted = [...tree].sort((a, b) => b[1].m - a[1].m);
  const rank = new Map(sorted.map(([k], i) => [k, i]));
  const colorOf = (k: string) => (rank.get(k)! < PALETTE.length ? PALETTE[rank.get(k)!] : OTHER);
  const share = (m: number) => (total ? `${((m / total) * 100).toFixed(1)}%` : "0%");
  const tableRows: RRow[] = sorted.map(([k, n]) => ({
    key: k, label: labelOf(p.by, k), minutes: n.m, dur: f(n.m), pct: share(n.m), people: 0, color: colorOf(k),
    kids: [...n.kids].sort((a, b) => b[1] - a[1]).map(([k2, m]) => ({ key: k2, label: labelOf(other, k2), minutes: m, dur: f(m), pct: share(m) })),
  }));
  const slices = [...sorted.slice(0, PALETTE.length).map(([k, n]) => ({ key: k, label: labelOf(p.by, k), value: n.m, color: colorOf(k) })),
    ...(sorted.length > PALETTE.length ? [{ key: "other", label: `${sorted.length - PALETTE.length} others`, value: sorted.slice(PALETTE.length).reduce((a, [, n]) => a + n.m, 0), color: OTHER }] : [])];

  // Hours over time, in days, weeks or months depending on how long the period is ("All time" runs from the first entry).
  const dates = rows.map((r) => r.date);
  const firstDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today();
  const lastDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : today();
  const shownFrom = p.range === "all" ? firstDate : from;
  const shownTo = p.range === "all" ? (lastDate > today() ? lastDate : today()) : to;
  const span = (toDate(shownTo).getTime() - toDate(shownFrom).getTime()) / 864e5 + 1;
  const unit = span <= 35 ? "day" : span <= 200 ? "week" : "month";
  const kOf = (d: string) => (unit === "day" ? d : unit === "week" ? monday(d) : d.slice(0, 7));
  const keys: string[] = [];
  const end = p.range === "all" ? shownTo : to < addDays(today(), 6) ? to : addDays(today(), 6);
  for (let d = shownFrom; d <= end; d = addDays(d, 1)) { const k = kOf(d); if (keys[keys.length - 1] !== k) keys.push(k); }
  const lbl = (k: string) => (unit === "month" ? toDate(k + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : unit === "day" ? `${DAYS[dow(k)]}, ${shortDate(k)}` : shortDate(k));
  const B: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const sk = keyOf(p.by, r), key = rank.get(sk)! < PALETTE.length ? sk : "other";
    const bucket = (B[kOf(r.date)] ??= {});
    bucket[key] = (bucket[key] ?? 0) + r.minutes / 60;
  }

  const nf = p.project.length + p.tag.length;
  const base = `${SHARE_PATH}/${token}`;
  const clearHref = `${base}?${shareQuery(p, { project: [], tag: [] })}`;
  const prev = stepRange(from, to, -1), next = stepRange(from, to, 1);
  const stepHref = (r: [string, string]) => `${base}?${shareQuery(p, { range: "custom", from: r[0], to: r[1] })}`;
  const opts = (a: { id: string; name: string }[]) => a.map((x) => ({ value: x.id, label: x.name }));
  const projectsCount = new Set(rows.map((r) => r.projectId)).size;

  return (
    <main className="shpg">
      <header className="shhead">
        <div className="shtitle">
          <p className="shkicker">Time report</p>
          <h1><Dot color={client.color} />{client.name}</h1>
          <p className="sub">{longDate(shownFrom)} to {longDate(shownTo)}. {client.shareApprovedOnly ? "Counts approved time only." : "Counts all time logged."}</p>
        </div>
        <ThemeToggle initial={theme} />
      </header>

      <AutoForm key={shareQuery(p)} manual className="rform">
        <div className="rtools">
          <div className="rtools-r">
            <div className="rdate">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
              <select id="sh-range" name="range" data-auto defaultValue={p.range} aria-label="Date range">{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {p.range === "all"
                ? <><span className="rdate-nav off" aria-hidden="true" aria-disabled="true">‹</span><span className="rdate-nav off" aria-hidden="true" aria-disabled="true">›</span></>
                : <><Link className="rdate-nav" href={stepHref(prev)} aria-label="Previous period" scroll={false}>‹</Link><Link className="rdate-nav" href={stepHref(next)} aria-label="Next period" scroll={false}>›</Link></>}
            </div>
            {p.range === "custom" && <div className="rdate-c">
              <div className="ifld"><label htmlFor="sh-from">From</label><input type="date" id="sh-from" name="from" data-auto defaultValue={from} min="2000-01-01" /></div>
              <div className="ifld"><label htmlFor="sh-to">To</label><input type="date" id="sh-to" name="to" data-auto defaultValue={to} /></div>
            </div>}
            <ExportMenu csvHref={`${base}/export?${shareQuery(p)}`} />
          </div>
        </div>

        <section className="panel rfilters" aria-label="Filters">
          <span className="rflabel">FILTER</span>
          <FilterMenu name="project" label="Project" options={opts(choices.projects)} selected={p.project} />
          <FilterMenu name="tag" label="Tag" options={opts(choices.tags)} selected={p.tag} />
          <span className="sp" />
          {nf > 0 && <Link className="btn" href={clearHref}>Clear {nf} filter{nf > 1 ? "s" : ""}</Link>}
          <button type="submit" className="btn primary">Apply filter</button>
        </section>

        <section className="rcard">
          <div className="rhead">
            <span className="rtotal">Total: <b>{f(total)}</b> <span className="note">hours</span></span>
            <span className="rcounts">{projectsCount.toLocaleString("en-US")} {projectsCount === 1 ? "project" : "projects"}</span>
          </div>
          <div className="rchart"><BarChart keys={keys} data={B} series={slices} unit={unit} lbl={lbl} f={f} empty={total === 0} /></div>
          <div className="rgroup">
            <Ifld id="sh-by" label="Group by" name="by" data-auto defaultValue={p.by}><option value="project">Project, then tag</option><option value="tag">Tag, then project</option></Ifld>
          </div>
          <div className="rsplit">
            <ReportTable rows={tableRows} titleLabel={p.by === "project" ? "Project" : "Tag"} showPeople={false} showEstimate={false} empty="No time in this period." />
            {total > 0 && <aside className="rdonut" aria-label={`Share of hours by ${p.by}`}><Donut slices={slices} total={total} centre={f(total)} /></aside>}
          </div>
        </section>
      </AutoForm>
      <p className="note shfoot">View only. Updated {longDate(today())}.</p>
    </main>
  );
}
