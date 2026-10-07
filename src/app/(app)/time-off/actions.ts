"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { holidayError, timeOffError } from "@/lib/scope";
import { findVisiblePerson } from "@/lib/profile";
import { addDays, isDateStr, longDate, shortDate, today, toDate, toStr } from "@/lib/dates";
import { weekdaysBetween } from "@/lib/expected";
import { parseDateFlexible, cleanText } from "@/lib/importParse";

export type TimeOffResult = { ok: boolean; error?: string; message?: string } | null;
const done = (message?: string) => { revalidatePath("/", "layout"); return { ok: true, message }; };
const fail = (error: string) => ({ ok: false, error });
const LOCKED = "This date is locked by an admin.";
const TYPES = ["PTO", "Sick leave", "Other"];
const MAX_DAYS = 366;

const range = (a: string, b: string) => (a === b ? longDate(a) : `${shortDate(a)} to ${shortDate(b)}`);

/** Adds time off for a person: the signed-in person, or someone they manage. */
export async function addTimeOff(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const settings = await getSettings(); // sets the company time zone, which decides "today"
  const userId = String(form.get("userId") ?? "") || me.id;
  const person = await findVisiblePerson(me, userId);
  if (!person) return fail("Choose a person.");
  if (!person.active) return fail("That person is not active.");
  const denied = timeOffError(me, person);
  if (denied) return fail(denied);

  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "") || from;
  if (!isDateStr(from) || !isDateStr(to)) return fail("Choose the first and last day.");
  if (to < from) return fail("The last day can't be before the first day.");
  if (from < "2000-01-01" || to > addDays(today(), 800)) return fail("Choose dates within the last few years and the next two.");
  if ((toDate(to).getTime() - toDate(from).getTime()) / 864e5 + 1 > MAX_DAYS) return fail("That is longer than a year. Split it into shorter stretches.");
  if (!weekdaysBetween(from, to)) return fail("That is a weekend, so there is nothing to take off. Choose a weekday.");
  if (settings.lockBeforeStr && from <= settings.lockBeforeStr) return fail(`${LOCKED} Time off can't start on or before ${longDate(settings.lockBeforeStr)}.`);

  const half = form.get("half") === "on";
  const type = String(form.get("type") ?? "");
  const label = TYPES.includes(type) ? type : "PTO";
  const note = cleanText(String(form.get("note") ?? "")).slice(0, 200);

  // Two rows on the same days would confuse the count, so ask to change the existing one instead.
  const clash = await db.timeOff.findFirst({ where: { userId: person.id, startDate: { lte: toDate(to) }, endDate: { gte: toDate(from) } } });
  if (clash) return fail(`${person.id === me.id ? "You" : person.name} already ${person.id === me.id ? "have" : "has"} time off on ${range(toStr(clash.startDate), toStr(clash.endDate))}. Remove it first to change it.`);

  await db.timeOff.create({ data: { userId: person.id, startDate: toDate(from), endDate: toDate(to), fraction: half ? 0.5 : 1, label, note, source: "manual", createdById: me.id } });
  await logAction(me.id, `Added ${label} for ${person.name}: ${range(from, to)}${half ? " (half days)" : ""}`, person.id);
  return done();
}

/** Removes time off typed in the app. Time off that came from another system can't be changed here. */
export async function removeTimeOff(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const settings = await getSettings();
  const row = await db.timeOff.findUnique({ where: { id: String(form.get("id") ?? "") } });
  const person = row ? await findVisiblePerson(me, row.userId) : null;
  if (!row || !person) return fail("That time off isn't there any more.");
  const denied = timeOffError(me, person);
  if (denied) return fail(denied);
  if (row.source !== "manual") return fail("This time off comes from another system and can't be changed here.");
  const a = toStr(row.startDate), b = toStr(row.endDate);
  if (settings.lockBeforeStr && a <= settings.lockBeforeStr) return fail(`${LOCKED} Time off that starts on or before ${longDate(settings.lockBeforeStr)} can't be removed.`);
  await db.timeOff.delete({ where: { id: row.id } });
  await logAction(me.id, `Removed ${row.label} for ${person.name}: ${range(a, b)}`, person.id);
  return done();
}

// ---------- public holidays ----------

type Parsed = { date: string; name: string; fraction: number };

/** Reads "2026-12-25, Christmas Day" lines (a date in any of the formats the imports accept, then the name). "(half)" at the end makes it half a day. */
function parseLines(text: string): { rows: Parsed[]; bad: string[] } {
  const rows: Parsed[] = [], bad: string[] = [];
  for (const raw of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = raw.match(/^([^,;\t]+)[,;\t]\s*(.+)$/) ?? raw.match(/^(\S+)\s+(.+)$/);
    const date = m ? parseDateFlexible(m[1].trim(), 2000, 2100) : null;
    let name = m ? cleanText(m[2]) : "";
    const half = /\(half( day)?\)\s*$/i.test(name);
    if (half) name = name.replace(/\(half( day)?\)\s*$/i, "").trim();
    if (!date || !name || name.length > 80) bad.push(raw.slice(0, 60)); else rows.push({ date, name, fraction: half ? 0.5 : 1 });
  }
  return { rows, bad };
}

/** Adds a public holiday (or several, pasted one per line) to an office, or to every office when an admin picks that. */
export async function addHoliday(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const settings = await getSettings();
  const pick = String(form.get("locationId") ?? "");
  // Location managers only ever work on their own office, whatever the form says.
  const offices = me.role === "ADMIN" ? (pick === "all" ? await db.location.findMany({ select: { id: true } }) : await db.location.findMany({ where: { id: pick }, select: { id: true } })) : [{ id: me.locationId }];
  if (!offices.length) return fail("Choose an office.");
  for (const o of offices) { const e = holidayError(me, o.id); if (e) return fail(e); }

  const bulk = String(form.get("bulk") ?? "").trim();
  let list: Parsed[];
  if (bulk) {
    const { rows, bad } = parseLines(bulk);
    if (bad.length) return fail(`I couldn't read ${bad.length === 1 ? "this line" : "these lines"}: ${bad.slice(0, 3).join(" | ")}${bad.length > 3 ? " …" : ""}. Write one holiday per line, like: 2026-12-25, Christmas Day`);
    if (!rows.length) return fail("Type the holidays, one per line, like: 2026-12-25, Christmas Day");
    if (rows.length > 100) return fail("That is more than 100 holidays at once. Add them in smaller groups.");
    list = rows;
  } else {
    const date = String(form.get("date") ?? ""), name = cleanText(String(form.get("name") ?? ""));
    if (!isDateStr(date) || date < "2000-01-01" || date > "2100-12-31") return fail("Choose the date of the holiday.");
    if (!name) return fail("Name the holiday.");
    if (name.length > 80) return fail("The name can be up to 80 characters.");
    list = [{ date, name, fraction: form.get("half") === "on" ? 0.5 : 1 }];
  }
  const locked = settings.lockBeforeStr ? list.find((h) => h.date <= settings.lockBeforeStr!) : undefined;
  if (locked) return fail(`${LOCKED} A holiday can't be added on or before ${longDate(settings.lockBeforeStr!)} (${longDate(locked.date)}).`);

  const names = [...new Map(list.map((h) => [h.date, h])).values()]; // the same date twice in one paste: the last one wins
  const data = offices.flatMap((o) => names.map((h) => ({ locationId: o.id, date: toDate(h.date), name: h.name, fraction: h.fraction })));
  const r = await db.holiday.createMany({ data, skipDuplicates: true });
  const where = offices.length > 1 ? "all offices" : (await db.location.findUnique({ where: { id: offices[0].id }, select: { name: true } }))?.name ?? "the office";
  if (!r.count) return fail(names.length === 1 && offices.length === 1 ? `${where} already has a holiday on ${longDate(names[0].date)}. Remove it first to change it.` : "Those holidays are already there.");
  await logAction(me.id, `Added ${r.count} public ${r.count === 1 ? "holiday" : "holidays"} for ${where}: ${names.length === 1 ? `${names[0].name}, ${longDate(names[0].date)}` : `${shortDate(names[0].date)} and others`}`);
  const skipped = data.length - r.count;
  return done(`Added ${r.count} ${r.count === 1 ? "holiday" : "holidays"} to ${where}${skipped ? ` (${skipped} already there)` : ""}.`);
}

export async function removeHoliday(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const settings = await getSettings();
  const row = await db.holiday.findUnique({ where: { id: String(form.get("id") ?? "") }, include: { location: { select: { name: true } } } });
  if (!row) return fail("That holiday isn't there any more.");
  const denied = holidayError(me, row.locationId);
  if (denied) return fail(denied);
  const d = toStr(row.date);
  if (settings.lockBeforeStr && d <= settings.lockBeforeStr) return fail(`${LOCKED} A holiday on or before ${longDate(settings.lockBeforeStr)} can't be removed.`);
  await db.holiday.delete({ where: { id: row.id } });
  await logAction(me.id, `Removed public holiday ${row.name}, ${longDate(d)} for ${row.location.name}`);
  return done();
}

