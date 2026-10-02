"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { approverUsersWhere } from "@/lib/scope";
import { logAction } from "@/lib/settings";
import { weekLabel, isDateStr } from "@/lib/dates";
import { sendEmail, appUrl } from "@/lib/email";

export type ApproveResult = { ok: boolean; message?: string } | null;

async function sheetInScope(id: string) {
  const me = await requireTab("approvals");
  const where = approverUsersWhere(me);
  if (!where) throw new Error("You can't approve timesheets.");
  const sheet = await db.timesheet.findFirst({ where: { id, user: where }, include: { user: true } });
  if (!sheet) throw new Error("That timesheet isn't one you can approve.");
  return { me, sheet };
}

export async function approve(form: FormData) {
  const { me, sheet } = await sheetInScope(String(form.get("id")));
  // Only a week that is still waiting can be approved, so an out-of-date page can't undo someone else's decision.
  const r = await db.timesheet.updateMany({ where: { id: sheet.id, status: "SUBMITTED" }, data: { status: "APPROVED", comment: "" } });
  if (r.count) await logAction(me.id, `Approved ${sheet.user.name}'s timesheet for ${weekLabel(sheet.weekStart.toISOString().slice(0, 10))}`, sheet.userId);
  revalidatePath("/approvals");
}

export async function approveAll() {
  const me = await requireTab("approvals");
  const where = approverUsersWhere(me);
  if (!where) return;
  const sheets = await db.timesheet.findMany({ where: { status: "SUBMITTED", user: where }, include: { user: true } });
  for (const s of sheets) {
    const r = await db.timesheet.updateMany({ where: { id: s.id, status: "SUBMITTED" }, data: { status: "APPROVED", comment: "" } });
    if (r.count) await logAction(me.id, `Approved ${s.user.name}'s timesheet for ${weekLabel(s.weekStart.toISOString().slice(0, 10))}`, s.userId);
  }
  revalidatePath("/approvals");
}

export async function sendBack(_: ApproveResult, form: FormData): Promise<ApproveResult> {
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { ok: false, message: "Add a short reason so they know what to fix." };
  const { me, sheet } = await sheetInScope(String(form.get("id")));
  const week = weekLabel(sheet.weekStart.toISOString().slice(0, 10));
  const r = await db.timesheet.updateMany({ where: { id: sheet.id, status: "SUBMITTED" }, data: { status: "REJECTED", comment: reason } });
  if (!r.count) return { ok: false, message: "Someone already handled this timesheet. Reload the page to see its status." };
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
