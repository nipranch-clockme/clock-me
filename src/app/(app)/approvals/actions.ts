"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { approverUsersWhere } from "@/lib/scope";
import { logAction } from "@/lib/settings";
import { weekLabel, isDateStr } from "@/lib/dates";
import { sendEmail, appUrl } from "@/lib/email";
import { staleText } from "@/lib/approvalText";

export type ApproveResult = { ok: boolean; message?: string } | null;

async function sheetInScope(id: string) {
  const me = await requireTab("approvals");
  const where = approverUsersWhere(me);
  if (!where) throw new Error("You can't approve timesheets.");
  const sheet = await db.timesheet.findFirst({ where: { id, user: where }, include: { user: true } });
  if (!sheet) throw new Error("That timesheet isn't one you can approve.");
  return { me, sheet };
}

/** When the approver's page last saw the timesheet. People can cancel and resubmit a week (same timesheet, new hours),
 *  so Approve and Send back only act on the version that was on screen. */
const seenAt = (v: FormDataEntryValue | null) => { const d = new Date(String(v ?? "")); return isNaN(d.getTime()) ? null : d; };

export async function approve(form: FormData) {
  const { me, sheet } = await sheetInScope(String(form.get("id")));
  const seen = seenAt(form.get("v"));
  // Only the version still waiting can be approved, so an out-of-date page can't undo someone else's decision
  // or approve hours the approver never saw.
  const r = seen ? await db.timesheet.updateMany({ where: { id: sheet.id, status: "SUBMITTED", updatedAt: seen }, data: { status: "APPROVED", comment: "" } }) : { count: 0 };
  revalidatePath("/approvals");
  if (!r.count) redirect(`/approvals?stale=${encodeURIComponent(sheet.id)}`);
  await logAction(me.id, `Approved ${sheet.user.name}'s timesheet for ${weekLabel(sheet.weekStart.toISOString().slice(0, 10))}`, sheet.userId);
  redirect("/approvals");
}

export async function approveAll(form: FormData) {
  const me = await requireTab("approvals");
  const where = approverUsersWhere(me);
  if (!where) return;
  // Only the timesheets that were on the page, in the version shown there.
  const shown = new Map(form.getAll("sheet").map((x) => String(x).split("|")).filter((x) => x.length === 2).map(([id, v]) => [id, seenAt(v)]));
  const sheets = await db.timesheet.findMany({ where: { id: { in: [...shown.keys()] }, status: "SUBMITTED", user: where }, include: { user: true } });
  let done = 0;
  for (const s of sheets) {
    const seen = shown.get(s.id);
    if (!seen) continue;
    const r = await db.timesheet.updateMany({ where: { id: s.id, status: "SUBMITTED", updatedAt: seen }, data: { status: "APPROVED", comment: "" } });
    if (r.count) { done++; await logAction(me.id, `Approved ${s.user.name}'s timesheet for ${weekLabel(s.weekStart.toISOString().slice(0, 10))}`, s.userId); }
  }
  revalidatePath("/approvals");
  redirect(done < shown.size ? `/approvals?skipped=${shown.size - done}` : "/approvals");
}

export async function sendBack(_: ApproveResult, form: FormData): Promise<ApproveResult> {
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { ok: false, message: "Add a short reason so they know what to fix." };
  const { me, sheet } = await sheetInScope(String(form.get("id")));
  const week = weekLabel(sheet.weekStart.toISOString().slice(0, 10));
  const seen = seenAt(form.get("v"));
  const r = seen ? await db.timesheet.updateMany({ where: { id: sheet.id, status: "SUBMITTED", updatedAt: seen }, data: { status: "REJECTED", comment: reason } }) : { count: 0 };
  if (!r.count) {
    const now = await db.timesheet.findUnique({ where: { id: sheet.id }, select: { status: true } });
    return { ok: false, message: staleText(now?.status, sheet.user.name, week) };
  }
  await logAction(me.id, `Sent back ${sheet.user.name}'s timesheet for ${week}: ${reason}`, sheet.userId);
  await sendEmail(sheet.user.email, `Your timesheet for ${week} was sent back`, `${me.name} sent back your timesheet for ${week}:\n\n${reason}\n\nFix it here: ${appUrl()}/timesheet`);
  revalidatePath("/approvals");
  return { ok: true };
}

export async function remind(_: ApproveResult, form: FormData): Promise<ApproveResult> {
  const me = await requireTab("approvals");
  const where = approverUsersWhere(me);
  const week = String(form.get("week"));
  if (!where || !isDateStr(week)) return { ok: false, message: "Can't send that reminder." };
  const user = await db.user.findFirst({ where: { AND: [where, { id: String(form.get("userId")) }] } });
  if (!user) return { ok: false, message: "That person isn't in your team." };
  const r = await sendEmail(user.email, `Please submit your timesheet for ${weekLabel(week)}`, `Hi ${user.name.split(" ")[0]},\n\nYour timesheet for ${weekLabel(week)} hasn't been submitted yet. Please fill it in and submit it: ${appUrl()}/timesheet\n\n${me.name}`);
  await logAction(me.id, `Sent ${user.name} a reminder to submit ${weekLabel(week)}`, user.id);
  return { ok: true, message: r.sent ? `Reminder emailed to ${user.name}.` : r.error ?? `Reminder logged for ${user.name}. Email sending isn't switched on yet.` };
}
