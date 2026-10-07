import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { approverUsersWhere, escalatedSheetsWhere } from "@/lib/scope";
import { addDays, dow, longDate, monday, today, toDate, weekLabel } from "@/lib/dates";
import { sendEmail, appUrl } from "@/lib/email";
import { loadExpected } from "@/lib/timeoff";
import { DEMO_DOMAIN } from "@/lib/demoDomain";

// Runs once a day (see vercel.json). Vercel calls it with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const s = await getSettings();
  const t = today();
  const sent = { submit: 0, daily: 0, approvers: 0 };
  // Demo people (see Settings) are made up, so they never get reminders
  const people = await db.user.findMany({ where: { active: true, passwordHash: { not: null }, weeklyTarget: { gt: 0 }, NOT: { email: { endsWith: "@" + DEMO_DOMAIN, mode: "insensitive" } } } });
  // Nobody is reminded about a day or week they have off: a public holiday in their office or time off they booked.
  const ex = await loadExpected(people, { from: addDays(t, -14), to: addDays(t, 7) });
  const starts = ex.starts;
  const link = `${appUrl()}/timesheet`;

  if (s.remindSubmit && dow(t) + 1 === s.remindSubmitDay) {
    // Early in the week the reminder is about the week that just ended; later it's about the current week.
    const ws = dow(t) < 2 ? addDays(monday(t), -7) : monday(t);
    const done = new Set((await db.timesheet.findMany({ where: { weekStart: toDate(ws), status: { in: ["SUBMITTED", "APPROVED"] } }, select: { userId: true } })).map((x) => x.userId));
    for (const u of people.filter((p) => !done.has(p.id) && starts.get(p.id)! <= addDays(ws, 6) && ex(p, ws, addDays(ws, 6), { whole: true }) > 0)) {
      await sendEmail(u.email, `Please submit your timesheet for ${weekLabel(ws)}`, `Hi ${u.name.split(" ")[0]},\n\nA reminder to fill in and submit your timesheet for ${weekLabel(ws)}: ${link}`);
      sent.submit++;
    }
  }

  if (s.remindDaily && dow(t) < 5 && s.dailyMinimum > 0) {
    const prev = dow(t) === 0 ? addDays(t, -3) : addDays(t, -1);
    if (!s.lockBeforeStr || prev > s.lockBeforeStr) {
      const totals = new Map((await db.timeEntry.groupBy({ by: ["userId"], where: { date: toDate(prev) }, _sum: { minutes: true } })).map((x) => [x.userId, x._sum.minutes ?? 0]));
      // A half day off halves the minimum; a whole day off (holiday or time off) skips the person.
      const owed = (p: (typeof people)[number]) => s.dailyMinimum * 60 * ex.days(p, prev, prev, { whole: true });
      for (const u of people.filter((p) => owed(p) > 0 && (totals.get(p.id) ?? 0) < owed(p) && starts.get(p.id)! <= prev)) {
        await sendEmail(u.email, `Time missing for ${longDate(prev)}`, `Hi ${u.name.split(" ")[0]},\n\nYou logged less than ${s.dailyMinimum} hours on ${longDate(prev)}. Please add the rest: ${link}`);
        sent.daily++;
      }
    }
  }

  if (s.remindApprovers) {
    const approvers = await db.user.findMany({ where: { active: true, passwordHash: { not: null }, role: { in: ["LEADER", "LOCATION", "ADMIN"] } }, include: { team: true, location: true } });
    for (const a of approvers) {
      const where = approverUsersWhere(a);
      if (!where) continue;
      // Location managers and admins only hear about weeks that need them; Team/Project Managers hear about every week in their team.
      const n = await db.timesheet.count({ where: { status: "SUBMITTED", user: where, ...(a.role === "LEADER" ? {} : escalatedSheetsWhere()) } });
      if (!n) continue;
      await sendEmail(a.email, `${n} timesheet${n > 1 ? "s" : ""} waiting for your approval`, `Hi ${a.name.split(" ")[0]},\n\n${n} timesheet${n > 1 ? "s are" : " is"} waiting for you: ${appUrl()}/approvals`);
      sent.approvers++;
    }
  }
  return Response.json({ ok: true, date: t, sent });
}
