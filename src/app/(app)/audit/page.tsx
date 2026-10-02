import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { scopeLabel, visibleUsersWhere } from "@/lib/scope";
import { roleName } from "@/lib/roles";
import { addDays, dow, longDate, today, toDate, toStr } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { Pill } from "@/components/ui";
import Link from "next/link";
import { AuditRemind } from "./AuditRemind";

const RANGES: [number, string][] = [[7, "7 days"], [28, "4 weeks"], [90, "90 days"]];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ days?: string; log?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("audit");
  const settings = await getSettings();
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  const days = RANGES.some((r) => String(r[0]) === sp.days) ? Number(sp.days) : 28;
  const from = addDays(today(), -days), to = addDays(today(), -1);
  const people = await db.user.findMany({ where: { AND: [visibleUsersWhere(me), { active: true, passwordHash: { not: null } }] }, orderBy: { name: "asc" }, select: { id: true, name: true, weeklyTarget: true, role: true } });
  const ids = people.map((u) => u.id);
  const U = new Map(people.map((u) => [u.id, u]));
  const [daily, fields, logs] = await Promise.all([
    ids.length ? db.timeEntry.groupBy({ by: ["userId", "date"], where: { userId: { in: ids }, date: { gte: toDate(from), lte: toDate(to) } }, _sum: { minutes: true } }) : [],
    db.customField.findMany({ where: { required: true } }),
    db.auditLog.findMany({ where: me.role === "ADMIN" ? {} : { userId: { in: ids } }, include: { user: { select: { name: true, role: true } } }, orderBy: { at: "desc" }, take: sp.log === "all" ? 2000 : 200 }),
  ]);

  // Required-field gaps: phase always; tag, description and custom fields when an admin requires them.
  const inRange = ids.length ? await db.timeEntry.findMany({ where: { userId: { in: ids }, date: { gte: toDate(from), lte: toDate(to) } }, select: { id: true, userId: true, date: true, minutes: true, phaseId: true, tagId: true, description: true, custom: true, project: { select: { name: true } } }, orderBy: { date: "desc" } }) : [];
  const missLabel = (e: (typeof inRange)[number]) => {
    const c = (e.custom ?? {}) as Record<string, string>;
    return [!e.phaseId && "Phase", settings.requireTag && !e.tagId && "Tag", settings.requireDescription && !e.description.trim() && "Description", ...fields.filter((cf) => !String(c[cf.id] ?? "").trim()).map((cf) => cf.name)].filter(Boolean).join(", ");
  };
  const missing = inRange.map((e) => ({ e, label: missLabel(e) })).filter((x) => x.label);

  const long = daily.filter((d) => (d._sum.minutes ?? 0) > 600).sort((a, b) => b.date.getTime() - a.date.getTime());
  const has = new Set(daily.map((d) => `${d.userId}|${toStr(d.date)}`));
  const gaps: { userId: string; date: string }[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) if (dow(d) < 5) for (const u of people) if (u.weeklyTarget > 0 && !has.has(`${u.id}|${d}`)) gaps.push({ userId: u.id, date: d });

  const box = (title: string, count: number, tone: string, children: React.ReactNode) => (
    <section className="panel">
      <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3><Pill tone={count ? tone : "approved"}>{String(count)}</Pill></div>
      <div className="list" style={{ maxHeight: 320, overflow: "auto" }}>{count ? children : <div className="empty">None found.</div>}</div>
    </section>
  );

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="row between">
          <div><h2>Time audit</h2><p className="sub" style={{ margin: 0 }}>Checks {longDate(from)} to {longDate(to)} for {scopeLabel(me) === "Whole company" ? "everyone" : scopeLabel(me)}.</p></div>
          <div className="seg" role="group" aria-label="Audit range">{RANGES.map(([k, l]) => <Link key={k} href={`/audit?days=${k}`} aria-pressed={days === k} className="segl">{l}</Link>)}</div>
        </div>
      </section>
      <div className="grid">
        {box("Days over 10 hours", long.length, "submitted", long.slice(0, 100).map((x) => (
          <div className="item" key={x.userId + x.date.toISOString()}><div>{U.get(x.userId)?.name}<div className="meta">{longDate(toStr(x.date))}</div></div><span className="num">{f(x._sum.minutes ?? 0)}</span></div>
        )))}
        {box("Workdays with no time", gaps.length, "submitted", gaps.slice(0, 100).map((x) => (
          <div className="item" key={x.userId + x.date}><div>{U.get(x.userId)?.name}<div className="meta">{longDate(x.date)}</div></div>{x.userId !== me.id && <AuditRemind userId={x.userId} date={x.date} />}</div>
        )))}
        {box("Entries missing required fields", missing.length, "rejected", missing.slice(0, 200).map(({ e, label }) => (
          <div className="item" key={e.id}><div>{U.get(e.userId)?.name} · {e.project.name}<div className="meta">{longDate(toStr(e.date))} · missing {label}</div></div><span className="num">{f(e.minutes)}</span></div>
        )))}
        <section className="panel full">
          <h3>Change log</h3>
          <p className="sub">Every edit, approval, lock and setting change, with who made it{me.role === "ADMIN" ? "" : `, for ${scopeLabel(me)}`}.</p>
          <div className="list" style={{ maxHeight: 420, overflow: "auto" }}>
            {logs.map((a) => <div className="item" key={a.id}><div>{a.action}<div className="meta">{a.user?.name ?? "Deleted user"}{a.user ? ` · ${roleName(a.user.role)}` : ""}</div></div><span className="note num">{a.at.toISOString().slice(0, 16).replace("T", " ")} UTC</span></div>)}
            {!logs.length && <div className="empty">No changes yet.</div>}
          </div>
          {logs.length >= 200 && sp.log !== "all" && <p className="note" style={{ margin: "8px 0 0" }}>Showing the latest 200. <Link href={`/audit?days=${days}&log=all`}>Show more</Link></p>}
        </section>
      </div>
    </>
  );
}
