import { db } from "@/lib/db";
import { isTimeZone } from "@/lib/dates";

const LIMIT = 200;

/** The latest lines of the change log, newest first: who did what, about whom and when. Read-only; Settings shows it to admins. */
export default async function ChangeLog({ timeZone }: { timeZone: string }) {
  const logs = await db.auditLog.findMany({ orderBy: [{ at: "desc" }, { id: "desc" }], take: LIMIT, select: { id: true, at: true, action: true, userId: true, targetUserId: true, user: { select: { name: true } } } });
  // The person a line is about has no relation on AuditLog, so look up their names in one go.
  const aboutIds = [...new Set(logs.flatMap((l) => (l.targetUserId && l.targetUserId !== l.userId ? [l.targetUserId] : [])))];
  const names = new Map((aboutIds.length ? await db.user.findMany({ where: { id: { in: aboutIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const when = new Intl.DateTimeFormat("en-US", { timeZone: isTimeZone(timeZone) ? timeZone : "UTC", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <section className="panel full">
      <h3 id="changelog-h">Change log</h3>
      <p className="note" style={{ margin: "0 0 8px" }}>The latest {LIMIT} changes people made, newest first. Times are in the company time zone.</p>
      <div className="list" role="region" aria-labelledby="changelog-h" tabIndex={0} style={{ maxHeight: 480, overflow: "auto" }}>
        {logs.map((l) => {
          const about = l.targetUserId && l.targetUserId !== l.userId ? names.get(l.targetUserId) : undefined;
          return (
            <div className="item" key={l.id}>
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}><bdi>{l.action}</bdi><div className="meta">{l.user.name}{about ? ` · about ${about}` : ""}</div></div>
              <time className="note num nowrap" dateTime={l.at.toISOString()}>{when.format(l.at)}</time>
            </div>
          );
        })}
        {!logs.length && <div className="empty">No changes yet.</div>}
      </div>
    </section>
  );
}
