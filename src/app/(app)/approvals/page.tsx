import Link from "next/link";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { approverUsersWhere, escalatedSheetsWhere, ESCALATE_DAYS, scopeLabel } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { addDays, longDate, monday, today, toDate, toStr, weekLabel } from "@/lib/dates";
import { fmtHours } from "@/lib/format";
import { PageHead, Pill } from "@/components/ui";
import { approve, approveAll } from "./actions";
import { RemindButton, SendBack } from "./ApprovalForms";
import { loadExpected } from "@/lib/timeoff";
import { staleText } from "@/lib/approvalText";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ stale?: string; skipped?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("approvals");
  const settings = await getSettings();
  const where = approverUsersWhere(me);
  const f = (m: number) => fmtHours(m, settings.timeFormat);
  if (!where) {
    return <section className="panel"><h2>Approvals</h2><p className="empty">Only Team/Project Managers, location managers and admins approve timesheets.</p></section>;
  }
  const lastWeek = addDays(monday(today()), -7);
  const [pending, people, lastWeekSheets] = await Promise.all([
    db.timesheet.findMany({ where: { status: "SUBMITTED", user: where }, include: { user: { include: { team: true, location: true } } }, orderBy: [{ weekStart: "asc" }] }),
    db.user.findMany({ where: { AND: [where, { active: true, passwordHash: { not: null }, weeklyTarget: { gt: 0 } }] }, include: { location: true }, orderBy: { name: "asc" } }),
    db.timesheet.findMany({ where: { weekStart: toDate(lastWeek), user: where }, select: { userId: true, status: true } }),
  ]);
  // Team/Project Managers approve their own team first. Location managers and admins see the weeks that really need them up top
  // (nobody on the team can approve, or the week has waited more than ESCALATE_DAYS) and the rest below, still approvable.
  const escalatedIds = me.role === "LEADER" || !pending.length ? null : new Set((await db.timesheet.findMany({ where: { id: { in: pending.map((s) => s.id) }, ...escalatedSheetsWhere() }, select: { id: true } })).map((x) => x.id));
  const mine = escalatedIds ? pending.filter((s) => escalatedIds.has(s.id)) : pending;
  const others = escalatedIds ? pending.filter((s) => !escalatedIds.has(s.id)) : [];
  // After an Approve or Approve all that didn't go through (see actions.ts), say why.
  const stale = sp.stale ? await db.timesheet.findFirst({ where: { id: sp.stale, user: where }, include: { user: true } }) : null;
  const skipped = Math.max(0, Math.floor(Number(sp.skipped) || 0));
  const entries = pending.length
    ? await db.timeEntry.findMany({
        where: { OR: pending.map((s) => ({ userId: s.userId, date: { gte: s.weekStart, lte: toDate(addDays(toStr(s.weekStart), 6)) } })) },
        select: { userId: true, date: true, minutes: true, projectId: true, project: { select: { name: true, client: { select: { name: true, color: true } } } } },
      })
    : [];
  // Sent-back weeks still count as not submitted. People who started after that week aren't listed.
  const submitted = new Set(lastWeekSheets.filter((s) => s.status === "SUBMITTED" || s.status === "APPROVED").map((s) => s.userId));
  // Expected hours for each person and week: weekly hours over Monday to Friday, less their office's public holidays and their time off.
  const weekStarts = [...pending.map((s) => toStr(s.weekStart)), lastWeek].sort();
  const ex = await loadExpected([...pending.map((s) => s.user), ...people], { from: weekStarts[0], to: addDays(weekStarts[weekStarts.length - 1], 6) });
  const lastWeekEnd = addDays(lastWeek, 6);
  // Nobody is asked to submit a week they were off all of.
  const late = people.filter((u) => !submitted.has(u.id) && ex.starts.get(u.id)! <= addDays(lastWeek, 4) && ex(u, lastWeek, lastWeekEnd, { whole: true }) > 0);

  const item = (s: (typeof pending)[number]) => {
            const ws = toStr(s.weekStart), we = addDays(ws, 6);
            const es = entries.filter((e) => e.userId === s.userId && toStr(e.date) >= ws && toStr(e.date) <= we);
            const total = es.reduce((a, e) => a + e.minutes, 0);
            const want = ex(s.user, ws, we, { whole: true });
            const fullWeek = s.user.weeklyTarget * 60;
            const byP = new Map<string, { m: number; color: string; name: string }>();
            es.forEach((e) => { const x = byP.get(e.projectId) ?? { m: 0, color: e.project.client.color, name: e.project.name }; x.m += e.minutes; byP.set(e.projectId, x); });
            return (
              <div className="item" style={{ flexWrap: "wrap" }} key={s.id}>
                <div style={{ minWidth: 0, flex: "1 1 300px" }}>
                  <strong><Link className="plink" href={`/profile/${s.userId}`}>{s.user.name}</Link></strong> <span className="meta">· {s.user.team?.name ?? "No team"} · {s.user.location.name} · {weekLabel(ws)}</span>
                  <div className="meta">{f(total)} of {f(want)} h {want < fullWeek ? "expected" : "target"} {want < fullWeek && <span title="Weekly target less public holidays and time off">({f(fullWeek)} h target less holidays and time off) </span>}{want > 0 && total < want && <Pill tone="warn">Under target</Pill>}</div>
                  <div className="chips" style={{ marginTop: 6 }}>{[...byP].map(([id, x]) => <span className="chip" key={id}><span className="dot" style={{ background: `var(--${x.color})` }} />{x.name} {f(x.m)}</span>)}</div>
                </div>
                <div className="row" style={{ alignItems: "center" }}>
                  <Link className="btn sm" href={`/reports?range=custom&from=${ws}&to=${we}&person=${s.userId}&group=project&ref=approvals`}>Review Time</Link>
                  <form action={approve}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="v" value={s.updatedAt.toISOString()} /><button className="btn ok sm">Approve</button></form>
                  <SendBack id={s.id} v={s.updatedAt.toISOString()} />
                </div>
              </div>
            );
          };

  return (
    <>
    <PageHead title="Approvals" sub={scopeLabel(me)} actions={mine.length > 1 ? <form action={approveAll}>{mine.map((s) => <input key={s.id} type="hidden" name="sheet" value={`${s.id}|${s.updatedAt.toISOString()}`} />)}<button className="btn ok">Approve all</button></form> : null} />
    <div className="grid max2">
      <section className="panel full">
        <div className="ch"><h2>Waiting for your approval</h2><span className="cd">{mine.length} timesheet{mine.length === 1 ? "" : "s"}</span></div>
        {me.role === "LEADER" ? <p className="note" style={{ margin: "0 0 10px" }}>You approve your own team's timesheets, your own included.</p> : <p className="note" style={{ margin: "0 0 10px" }}>Team/Project Managers approve their own teams. These are the weeks that need you: nobody on the team can approve, or the week has waited more than {ESCALATE_DAYS} days.</p>}
        {stale && <p className="alert warn" role="status">{staleText(stale.status, stale.user.name, weekLabel(toStr(stale.weekStart)))}</p>}
        {skipped > 0 && <p className="alert warn" role="status">{skipped === 1 ? "One timesheet was" : `${skipped} timesheets were`} changed, cancelled or handled by someone else after you opened this page, so {skipped === 1 ? "it wasn't" : "they weren't"} approved. Check the list below.</p>}
        <div className="list">
          {mine.map(item)}
          {!mine.length && <div className="empty">{others.length ? "Nothing here needs you." : "All caught up. Nothing to approve."}</div>}
        </div>
      </section>
      {others.length > 0 && (
        <section className="panel full">
          <div className="ch"><h2>Waiting with their Team/Project Managers</h2><span className="cd">{others.length} timesheet{others.length === 1 ? "" : "s"}</span></div>
          <p className="note" style={{ margin: "0 0 10px" }}>Their managers approve these. Step in only if really needed, for example if a manager is away.</p>
          <div className="list">{others.map(item)}</div>
        </section>
      )}
      <section className="panel">
        <h3>Not submitted for {weekLabel(lastWeek)}</h3>
        <div className="list">
          {late.map((u) => <div className="item" key={u.id}><div><Link className="plink" href={`/profile/${u.id}`}>{u.name}</Link><div className="meta">{u.title} · {u.location.name}</div></div><RemindButton userId={u.id} week={lastWeek} /></div>)}
          {!late.length && <div className="empty">Everyone submitted.</div>}
        </div>
      </section>
      <section className="panel">
        <h3>Lock status</h3>
        <p style={{ margin: "0 0 8px" }}>Timesheets on or before <strong>{settings.lockBeforeStr ? longDate(settings.lockBeforeStr) : "(none)"}</strong> are locked.</p>
        <p className="note" style={{ margin: 0 }}>{me.role === "ADMIN" ? "Change this in Settings." : "Only admins can change the lock date."}</p>
      </section>
    </div>
    </>
  );
}
