import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { approverUsersWhere } from "@/lib/scope";
import { addDays, dow, longDate, monday, today, toDate, weekLabel } from "@/lib/dates";
import { sendEmail, appUrl } from "@/lib/email";

// Runs once a day (see vercel.json). Vercel calls it with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const s = await getSettings();
  const t = today();
  const sent = { submit: 0, daily: 0, approvers: 0 };
  const people = await db.user.findMany({ where: { active: true, passwordHash: { not: null }, weeklyTarget: { gt: 0 } } });
  const link = `${appUrl()}/timesheet`;

  if (s.remindSubmit && dow(t) + 1 === s.remindSubmitDay) {
    const ws = monday(t);
    const done = new Set((await db.timesheet.findMany({ where: { weekStart: toDate(ws), status: { in: ["SUBMITTED", "APPROVED"] } }, select: { userId: true } })).map((x) => x.userId));
    for (const u of people.filter((p) => !done.has(p.id))) {
      await sendEmail(u.email, `Please submit your timesheet for ${weekLabel(ws)}`, `Hi ${u.name.split(" ")[0]},\n\nA reminder to fill in and submit your timesheet for ${weekLabel(ws)}: ${link}`);
      sent.submit++;
    }
  }

  if (s.remindDaily && dow(t) < 5 && s.dailyMinimum > 0) {
    const prev = dow(t) === 0 ? addDays(t, -3) : addDays(t, -1);
    if (!s.lockBeforeStr || prev > s.lockBeforeStr) {
      const totals = new Map((await db.timeEntry.groupBy({ by: ["userId"], where: { date: toDate(prev) }, _sum: { minutes: true } })).map((x) => [x.userId, x._sum.minutes ?? 0]));
      for (const u of people.filter((p) => (totals.get(p.id) ?? 0) < s.dailyMinimum * 60)) {
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
      const n = await db.timesheet.count({ where: { status: "SUBMITTED", user: where } });
      if (!n) continue;
      await sendEmail(a.email, `${n} timesheet${n > 1 ? "s" : ""} waiting for your approval`, `Hi ${a.name.split(" ")[0]},\n\n${n} timesheet${n > 1 ? "s are" : " is"} waiting for you: ${appUrl()}/approvals`);
      sent.approvers++;
    }
  }
  return Response.json({ ok: true, date: t, sent });
}
