"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { canManagePerson } from "@/lib/scope";
import { logAction } from "@/lib/settings";
import { toDate } from "@/lib/dates";
import { changeText, gridYear, readCells, rowEdit, yearMonths, type GridResult } from "@/lib/monthGrid";

const MAX_WEEKLY = 80; // the same ceiling as a person's usual expected hours

/** Saves the Monthly hours table: each person's expected hours per week for the months of a year. Admins change anyone's; location managers their own office's
 *  (never admins or other location managers), as on the People page. */
export async function saveMonthlyHours(_: GridResult, form: FormData): Promise<GridResult> {
  const me = await requireTab("people");
  const year = gridYear(String(form.get("year") ?? ""));
  const months = yearMonths(year);
  const cells = readCells(form, months);
  const people = await db.user.findMany({ where: { id: { in: [...cells.keys()] } }, select: { id: true, name: true, role: true, locationId: true, weeklyTarget: true, monthlyHours: true } });
  if (people.length !== cells.size) return { ok: false, error: "One of the people no longer exists. Reload the page and try again." };

  // Check everything before writing anything, so one wrong figure saves nothing.
  const plans = [];
  for (const p of people) {
    if (!canManagePerson(me, p)) return { ok: false, error: `${p.name}: you don't have permission to change that person's hours.` };
    if (p.role === "ADMIN") return { ok: false, error: `${p.name} is an admin, who is not a resource, so no hours are expected.` };
    const own = new Map(p.monthlyHours.map((m) => [m.month.toISOString().slice(0, 7), m.weeklyHours]));
    const edit = rowEdit(cells.get(p.id)!, own, p.weeklyTarget, MAX_WEEKLY);
    if ("error" in edit) return { ok: false, error: `${p.name}: ${edit.error.replace("Enter hours", "Enter weekly hours")}` };
    if (edit.upsert.length || edit.remove.length) plans.push({ p, edit });
  }
  if (!plans.length) return { ok: true, message: "Nothing changed." };

  await db.$transaction(plans.flatMap(({ p, edit }) => [
    ...edit.upsert.map(([ym, weeklyHours]) => db.userMonth.upsert({ where: { userId_month: { userId: p.id, month: toDate(ym + "-01") } }, create: { userId: p.id, month: toDate(ym + "-01"), weeklyHours }, update: { weeklyHours } })),
    ...(edit.remove.length ? [db.userMonth.deleteMany({ where: { userId: p.id, month: { in: edit.remove.map((ym) => toDate(ym + "-01")) } } })] : []),
  ]));
  for (const { p, edit } of plans) if (edit.changed.length) await logAction(me.id, `Changed expected hours per week for ${p.name}, ${year}: ${changeText(edit.changed)}`, p.id);
  revalidatePath("/", "layout");
  return { ok: true, message: `Saved hours for ${plans.length} ${plans.length === 1 ? "person" : "people"}.` };
}
