"use server";
import { revalidatePath } from "next/cache";
import type { ClientStatus, DrawingStandard } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { toDate, today } from "@/lib/dates";
import { contractOf, loadContractMonths } from "@/lib/clients";
import { changeText, gridYear, readCells, rowEdit, yearMonths, type GridResult } from "@/lib/monthGrid";
import { CLIENT_STATUS, DRAWING_STANDARDS, labelOf } from "@/lib/clientStatus";

const MAX_HOURS = 100000; // the same ceiling as a client's usual monthly hours
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
/** The values a row sends under a prefix, by client id (e.g. "st|id" for a status). A blank value is sent as "". */
const byPrefix = (form: FormData, prefix: string) =>
  new Map<string, string>([...new Set(form.keys())].filter((k) => k.startsWith(prefix)).map((k): [string, string] => [k.slice(prefix.length), String(form.get(k) ?? "")]));

/** Saves the Monthly contracts table: each client's contracted hours for the months of a year, its kinds of work, its status and its drawing standard.
 *  Admins only, as for any change to a contract. Months before this one are locked unless the browser sends pastOk, after the admin has confirmed twice. */
export async function saveContractMonths(_: GridResult, form: FormData): Promise<GridResult> {
  const me = await requireTab("clients");
  if (me.role !== "ADMIN") return { ok: false, error: "Only Admins can change contracts." };
  await getSettings(); // sets the company time zone, which decides which years the table offers and which months are past
  const year = gridYear(String(form.get("year") ?? ""));
  const months = yearMonths(year);
  const cells = readCells(form, months);
  const types = new Map<string, string[]>(); // a client's work types are sent only for rows that have them on the page (an empty list is allowed)
  for (const k of new Set([...form.keys()].filter((x) => x.startsWith("w|")))) types.set(k.slice(2), form.getAll(k).map(String).filter(Boolean));
  const statuses = byPrefix(form, "st|");
  const drawings = byPrefix(form, "dr|");
  const ids = new Set([...cells.keys(), ...types.keys(), ...statuses.keys(), ...drawings.keys()]);
  const clients = await db.client.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, type: true, monthlyHours: true, workTypeIds: true, status: true, drawingStandard: true },
  });
  if (clients.length !== ids.size) return { ok: false, error: "One of the clients no longer exists. Reload the page and try again." };
  const tags = await db.tag.findMany({ select: { id: true, name: true } });
  const tagIds = new Set(tags.map((t) => t.id));
  const cm = await loadContractMonths();
  const curYm = today().slice(0, 7);
  const pastOk = form.get("pastOk") === "1";
  const statusIds = new Set(CLIENT_STATUS.map((s) => s.value));
  const drawingIds = new Set(DRAWING_STANDARDS.map((d) => d.value));

  // Check everything before writing anything, so one wrong figure saves nothing.
  const plans = [];
  for (const c of clients) {
    const edit = rowEdit(cells.get(c.id) ?? new Map(), cm.get(c.id), contractOf(c) ?? 0, MAX_HOURS);
    if ("error" in edit) return { ok: false, error: `${c.name}: ${edit.error}` };
    if (!pastOk && edit.changed.some((x) => x.ym < curYm)) return { ok: false, error: `${c.name}: past months are locked. Choose Change past months to edit them.` };
    const wanted = types.get(c.id);
    if (wanted?.some((t) => !tagIds.has(t))) return { ok: false, error: `${c.name}: choose work types from the list.` };
    const kinds = wanted && !same(wanted, c.workTypeIds) ? [...new Set(wanted)] : null;
    const st = statuses.get(c.id);
    if (st !== undefined && !statusIds.has(st)) return { ok: false, error: `${c.name}: choose a status from the list.` };
    const status = st !== undefined && st !== c.status ? (st as ClientStatus) : undefined;
    const dr = drawings.get(c.id);
    if (dr && !drawingIds.has(dr)) return { ok: false, error: `${c.name}: choose a drawing standard from the list.` };
    const drawing = dr !== undefined && (dr || null) !== c.drawingStandard ? ((dr || null) as DrawingStandard | null) : undefined;
    if (edit.upsert.length || edit.remove.length || kinds || status !== undefined || drawing !== undefined) plans.push({ c, edit, kinds, status, drawing });
  }
  if (!plans.length) return { ok: true, message: "Nothing changed." };

  await db.$transaction(plans.flatMap(({ c, edit, kinds, status, drawing }) => [
    ...edit.upsert.map(([ym, hours]) => db.clientMonth.upsert({ where: { clientId_month: { clientId: c.id, month: toDate(ym + "-01") } }, create: { clientId: c.id, month: toDate(ym + "-01"), hours }, update: { hours } })),
    ...(edit.remove.length ? [db.clientMonth.deleteMany({ where: { clientId: c.id, month: { in: edit.remove.map((ym) => toDate(ym + "-01")) } } })] : []),
    ...(kinds || status !== undefined || drawing !== undefined
      ? [db.client.update({ where: { id: c.id }, data: { ...(kinds ? { workTypeIds: kinds } : {}), ...(status !== undefined ? { status } : {}), ...(drawing !== undefined ? { drawingStandard: drawing } : {}) } })]
      : []),
  ]));
  for (const { c, edit, kinds, status, drawing } of plans) {
    if (edit.changed.length) {
      const past = edit.changed.some((x) => x.ym < curYm);
      await logAction(me.id, `Changed contracted hours for client ${c.name}, ${year}: ${changeText(edit.changed)}${past ? " (a past month, after the warning)" : ""}`);
    }
    if (kinds) await logAction(me.id, `Changed work types for client ${c.name} to ${tags.filter((t) => kinds.includes(t.id)).map((t) => t.name).join(" + ") || "none"}`);
    if (status !== undefined) await logAction(me.id, `Changed status for client ${c.name} to ${labelOf(CLIENT_STATUS, status)}`);
    if (drawing !== undefined) await logAction(me.id, `Changed drawing standard for client ${c.name} to ${labelOf(DRAWING_STANDARDS, drawing ?? "") || "none"}`);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Saved changes for ${plans.length} client${plans.length === 1 ? "" : "s"}.` };
}
