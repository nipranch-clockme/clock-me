import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { approverUsersWhere, scopeLabel } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { addDays, longDate, monday, today, toDate, toStr, weekLabel } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { Pill } from "@/components/ui";
import { approve, approveAll } from "./actions";
import { RemindButton, SendBack } from "./ApprovalForms";
import { trackingStarts } from "@/lib/startDates";

export default async function ApprovalsPage() {
  const me = await requireTab("approvals");
  const settings = await getSettings();
  const where = approverUsersWhere(me);
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  if (!where) {
    return <section className="panel"><h2>Approvals</h2><p className="empty">Project managers don&apos;t approve timesheets. Team leaders, location managers and admins do.</p></section>;
  }
  const lastWeek = addDays(monday(today()), -7);
  const [pending, people, lastWeekSheets] = await Promise.all([
    db.timesheet.findMany({ where: { status: "SUBMITTED", user: where }, include: { user: { include: { team: true, location: true } } }, orderBy: [{ weekStart: "asc" }] }),
    db.user.findMany({ where: { AND: [where, { active: true, passwordHash: { not: null }, weeklyTarget: { gt: 0 } }] }, include: { location: true }, orderBy: { name: "asc" } }),
    db.timesheet.findMany({ where: { weekStart: toDate(lastWeek), user: where }, select: { userId: true, status: true } }),
  ]);
  const entries = pending.length
    ? await db.timeEntry.findMany({
        where: { OR: pending.map((s) => ({ userId: s.userId, date: { gte: s.weekStart, lte: toDate(addDays(toStr(s.weekStart), 6)) } })) },
        select: { userId: true, date: true, minutes: true, projectId: true, project: { select: { name: true, client: { select: { name: true, color: true } } } } },
      })
    : [];
  // Sent-back weeks still count as not submitted. People who started after that week aren't listed.
  const submitted = new Set(lastWeekSheets.filter((s) => s.status === "SUBMITTED" || s.status === "APPROVED").map((s) => s.userId));
  const starts = await trackingStarts(people);
  const late = people.filter((u) => !submitted.has(u.id) && starts.get(u.id)! <= addDays(lastWeek, 4));

  return (
    <div className="grid">
      <section className="panel full">
        <div className="row between">
          <div><h2>Waiting for your approval</h2><p className="sub">{scopeLabel(me)} · {pending.length} timesheet{pending.length === 1 ? "" : "s"}</p></div>
          {pending.length > 1 && <form action={approveAll}><button className="btn ok">Approve all</button></form>}
        </div>
        <div className="list">
          {pending.map((s) => {
            const ws = toStr(s.weekStart), we = addDays(ws, 6);
            const es = entries.filter((e) => e.userId === s.userId && toStr(e.date) >= ws && toStr(e.date) <= we);
            const total = es.reduce((a, e) => a + e.minutes, 0);
            const byP = new Map<string, { m: number; color: string; name: string }>();
            es.forEach((e) => { const x = byP.get(e.projectId) ?? { m: 0, color: e.project.client.color, name: e.project.name }; x.m += e.minutes; byP.set(e.projectId, x); });
            return (
              <div className="item" style={{ flexWrap: "wrap" }} key={s.id}>
                <div style={{ minWidth: 0, flex: "1 1 300px" }}>
                  <strong>{s.user.name}</strong> <span className="meta">· {s.user.team?.name ?? "No team"} · {s.user.location.name} · {weekLabel(ws)}</span>
                  <div className="meta">{f(total)} of {f(s.user.weeklyTarget * 60)} h target {total < s.user.weeklyTarget * 60 && <Pill tone="warn">Under target</Pill>}</div>
                  <div className="chips" style={{ marginTop: 6 }}>{[...byP].map(([id, x]) => <span className="chip" key={id}><span className="dot" style={{ background: `var(--${x.color})` }} />{x.name} {f(x.m)}</span>)}</div>
                </div>
                <div className="row" style={{ alignItems: "center" }}>
                  <form action={approve}><input type="hidden" name="id" value={s.id} /><button className="btn ok sm">Approve</button></form>
                  <SendBack id={s.id} />
                </div>
              </div>
            );
          })}
          {!pending.length && <div className="empty">All caught up. Nothing to approve.</div>}
        </div>
      </section>
      <section className="panel">
        <h3>Not submitted for {weekLabel(lastWeek)}</h3>
        <div className="list">
          {late.map((u) => <div className="item" key={u.id}><div>{u.name}<div className="meta">{u.title} · {u.location.name}</div></div><RemindButton userId={u.id} week={lastWeek} /></div>)}
          {!late.length && <div className="empty">Everyone submitted.</div>}
        </div>
      </section>
      <section className="panel">
        <h3>Lock status</h3>
        <p style={{ margin: "0 0 8px" }}>Timesheets on or before <strong>{settings.lockBeforeStr ? longDate(settings.lockBeforeStr) : "(none)"}</strong> are locked.</p>
        <p className="note" style={{ margin: 0 }}>{me.role === "ADMIN" ? "Change this in Settings." : "Only admins can change the lock date."}</p>
      </section>
    </div>
  );
}
