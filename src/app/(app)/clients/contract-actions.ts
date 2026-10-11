"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { toDate } from "@/lib/dates";
import { contractOf, loadContractMonths } from "@/lib/clients";
import { changeText, gridYear, readCells, rowEdit, yearMonths, type GridResult } from "@/lib/monthGrid";

const MAX_HOURS = 100000; // the same ceiling as a client's usual monthly hours
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Saves the Monthly contracts table: each client's contracted hours for the months of a year, and its kinds of work. Admins only, as for any change to a contract. */
export async function saveContractMonths(_: GridResult, form: FormData): Promise<GridResult> {
  const me = await requireTab("clients");
  if (me.role !== "ADMIN") return { ok: false, error: "Only admins can change contracts." };
  const year = gridYear(String(form.get("year") ?? ""));
  const months = yearMonths(year);
  const cells = readCells(form, months);
  const types = new Map<string, string[]>(); // a client's work types are sent only for rows that have them on the page (an empty list is allowed)
  for (const k of new Set([...form.keys()].filter((x) => x.startsWith("w|")))) types.set(k.slice(2), form.getAll(k).map(String).filter(Boolean));
  const ids = new Set([...cells.keys(), ...types.keys()]);
  const clients = await db.client.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, type: true, monthlyHours: true, workTypeIds: true } });
  if (clients.length !== ids.size) return { ok: false, error: "One of the clients no longer exists. Reload the page and try again." };
  const tags = await db.tag.findMany({ select: { id: true, name: true } });
  const tagIds = new Set(tags.map((t) => t.id));
  const cm = await loadContractMonths();

  // Check everything before writing anything, so one wrong figure saves nothing.
  const plans = [];
  for (const c of clients) {
    const edit = rowEdit(cells.get(c.id) ?? new Map(), cm.get(c.id), contractOf(c) ?? 0, MAX_HOURS);
    if ("error" in edit) return { ok: false, error: `${c.name}: ${edit.error}` };
    const wanted = types.get(c.id);
    if (wanted?.some((t) => !tagIds.has(t))) return { ok: false, error: `${c.name}: choose work types from the list.` };
    const kinds = wanted && !same(wanted, c.workTypeIds) ? [...new Set(wanted)] : null;
    if (edit.upsert.length || edit.remove.length || kinds) plans.push({ c, edit, kinds });
  }
  if (!plans.length) return { ok: true, message: "Nothing changed." };

  await db.$transaction(plans.flatMap(({ c, edit, kinds }) => [
    ...edit.upsert.map(([ym, hours]) => db.clientMonth.upsert({ where: { clientId_month: { clientId: c.id, month: toDate(ym + "-01") } }, create: { clientId: c.id, month: toDate(ym + "-01"), hours }, update: { hours } })),
    ...(edit.remove.length ? [db.clientMonth.deleteMany({ where: { clientId: c.id, month: { in: edit.remove.map((ym) => toDate(ym + "-01")) } } })] : []),
    ...(kinds ? [db.client.update({ where: { id: c.id }, data: { workTypeIds: kinds } })] : []),
  ]));
  for (const { c, edit, kinds } of plans) {
    if (edit.changed.length) await logAction(me.id, `Changed contracted hours for client ${c.name}, ${year}: ${changeText(edit.changed)}`);
    if (kinds) await logAction(me.id, `Changed work types for client ${c.name} to ${tags.filter((t) => kinds.includes(t.id)).map((t) => t.name).join(" + ") || "none"}`);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Saved changes for ${plans.length} client${plans.length === 1 ? "" : "s"}.` };
}
