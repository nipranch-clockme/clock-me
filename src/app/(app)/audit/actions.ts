"use server";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { visibleUsersWhere } from "@/lib/scope";
import { logAction } from "@/lib/settings";
import { isDateStr, longDate } from "@/lib/dates";
import { sendEmail, appUrl } from "@/lib/email";

export type RemindResult = { message: string } | null;

export async function remindDay(_: RemindResult, form: FormData): Promise<RemindResult> {
  const me = await requireTab("audit");
  const date = String(form.get("date"));
  const user = await db.user.findFirst({ where: { AND: [visibleUsersWhere(me), { id: String(form.get("userId")) }] } });
  if (!user || !isDateStr(date)) return { message: "Can't remind them." };
  const r = await sendEmail(user.email, `No time logged for ${longDate(date)}`, `Hi ${user.name.split(" ")[0]},\n\nThere's no time in Clock me for ${longDate(date)}. Please add it: ${appUrl()}/timesheet\n\n${me.name}`);
  await logAction(me.id, `Reminded ${user.name} to log time for ${longDate(date)}`, user.id);
  return { message: r.sent ? "Reminder sent" : "Reminder logged" };
}
