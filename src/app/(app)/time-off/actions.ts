"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { holidayError, timeOffApproveError, timeOffApproverWhere, timeOffError } from "@/lib/scope";
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

/** Asks for time off for the signed-in person (a request a location manager or admin approves), or adds it for someone they manage
 *  (a location manager for their office, an admin for anyone), which takes effect at once. Past dates are allowed, unless locked. */
export async function addTimeOff(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const settings = await getSettings(); // sets the company time zone, which decides "today"
  const userId = String(form.get("userId") ?? "") || me.id;
  const person = await findVisiblePerson(me, userId);
  if (!person) return fail("Choose a person.");
  if (!person.active) return fail("That person is not active.");
  const own = person.id === me.id;
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

  // Two rows on the same days would confuse the count, so ask to change the existing one instead. Declined requests don't count.
  const clash = await db.timeOff.findFirst({ where: { userId: person.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: toDate(to) }, endDate: { gte: toDate(from) } } });
  if (clash) {
    const what = `${clash.status === "PENDING" ? "a request for " : ""}time off on ${range(toStr(clash.startDate), toStr(clash.endDate))}`;
    const fix = clash.status === "PENDING" ? "Withdraw it first to send a different one."
      : own ? "Ask your location manager or an admin to change it."
      : "Remove it first to change it.";
    return fail(`${own ? "You" : person.name} already ${own ? "have" : "has"} ${what}. ${fix}`);
  }

  const pending = own;
  await db.timeOff.create({ data: {
    userId: person.id, startDate: toDate(from), endDate: toDate(to), fraction: half ? 0.5 : 1, label, note, source: "manual", createdById: me.id,
    status: pending ? "PENDING" : "APPROVED", decidedById: pending ? null : me.id, decidedAt: pending ? null : new Date(),
  } });
  if (pending) {
    await logAction(me.id, `Asked for ${label}: ${range(from, to)}${half ? " (half days)" : ""}`, me.id);
    return done("Request sent. A location manager or admin will approve it.");
  }
  await logAction(me.id, `Added ${label} for ${person.name}: ${range(from, to)}${half ? " (half days)" : ""}`, person.id);
  return done();
}

/** Removes time off typed in the app. A person can withdraw their own request, and remove their own or someone they manage's time off.
 *  Time off from another system can't be changed here. Requests from others are approved or declined in Approvals. */
export async function removeTimeOff(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const settings = await getSettings();
  const row = await db.timeOff.findUnique({ where: { id: String(form.get("id") ?? "") } });
  const person = row ? await findVisiblePerson(me, row.userId) : null;
  if (!row || !person) return fail("That time off isn't there any more.");
  const a = toStr(row.startDate), b = toStr(row.endDate);
  if (row.status === "PENDING") {
    if (row.userId !== me.id) return fail("Approve or decline this request in Approvals.");
    await db.timeOff.delete({ where: { id: row.id } });
    await logAction(me.id, `Withdrew the request for ${row.label}: ${range(a, b)}`, me.id);
    return done("Request withdrawn.");
  }
  const denied = timeOffError(me, person);
  if (denied) return fail(denied);
  if (row.source !== "manual") return fail("This time off comes from another system and can't be changed here.");
  if (settings.lockBeforeStr && a <= settings.lockBeforeStr) return fail(`${LOCKED} Time off that starts on or before ${longDate(settings.lockBeforeStr)} can't be removed.`);
  await db.timeOff.delete({ where: { id: row.id } });
  await logAction(me.id, `Removed ${row.label} for ${person.name}: ${range(a, b)}`, person.id);
  return done();
}

/** Approves a request for time off (location managers and admins, see timeOffApproveError). Dates on or before the lock date can't be approved. */
export async function approveTimeOff(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("approvals");
  const settings = await getSettings();
  const where = timeOffApproverWhere(me);
  const row = where ? await db.timeOff.findFirst({ where: { AND: [where, { id: String(form.get("id") ?? "") }] }, include: { user: true } }) : null;
  if (!row) return fail("That request isn't there any more.");
  const denied = timeOffApproveError(me, row.user);
  if (denied) return fail(denied);
  const a = toStr(row.startDate), b = toStr(row.endDate);
  if (settings.lockBeforeStr && a <= settings.lockBeforeStr) return fail(`${LOCKED} Time off that starts on or before ${longDate(settings.lockBeforeStr)} can't be approved.`);
  // Two requests for the same days can both be waiting. Only one can be approved.
  const clash = await db.timeOff.findFirst({ where: { userId: row.userId, id: { not: row.id }, status: "APPROVED", startDate: { lte: row.endDate }, endDate: { gte: row.startDate } } });
  if (clash) return fail(`${row.user.name} already has approved time off on ${range(toStr(clash.startDate), toStr(clash.endDate))}. Decline this request, or remove that one first.`);
  await db.timeOff.update({ where: { id: row.id }, data: { status: "APPROVED", decidedById: me.id, decidedAt: new Date(), decisionNote: "" } });
  await logAction(me.id, `Approved ${row.label} for ${row.user.name}: ${range(a, b)}`, row.userId);
  return done("Approved.");
}

/** Declines a request for time off, with an optional note for the person who asked. */
export async function declineTimeOff(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("approvals");
  const where = timeOffApproverWhere(me);
  const row = where ? await db.timeOff.findFirst({ where: { AND: [where, { id: String(form.get("id") ?? "") }] }, include: { user: true } }) : null;
  if (!row) return fail("That request isn't there any more.");
  const denied = timeOffApproveError(me, row.user);
  if (denied) return fail(denied);
  const note = cleanText(String(form.get("note") ?? "")).slice(0, 200);
  const a = toStr(row.startDate), b = toStr(row.endDate);
  await db.timeOff.update({ where: { id: row.id }, data: { status: "DECLINED", decidedById: me.id, decidedAt: new Date(), decisionNote: note } });
  await logAction(me.id, `Declined the ${row.label} request from ${row.user.name}: ${range(a, b)}`, row.userId);
  return done("Declined.");
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

/** Adds a public holiday, or several pasted one per line, to each office ticked. Admins only. */
export async function addHoliday(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const denied = holidayError(me);
  if (denied) return fail(denied);
  const settings = await getSettings();
  const ids = [...new Set(form.getAll("locationId").map(String).filter(Boolean))];
  if (!ids.length) return fail("Choose at least one office.");
  const offices = await db.location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  if (offices.length !== ids.length) return fail("One of those offices isn't there any more. Reload the page and try again.");
  const total = await db.location.count();
  const where = offices.length === total && total > 1 ? "all offices" : offices.length <= 3 ? offices.map((o) => o.name).join(", ") : `${offices.length} offices`;

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
  if (!r.count) return fail(names.length === 1 && offices.length === 1 ? `${where} already has a holiday on ${longDate(names[0].date)}. Remove it first to change it.` : "Those holidays are already there.");
  await logAction(me.id, `Added ${r.count} public ${r.count === 1 ? "holiday" : "holidays"} for ${where}: ${names.length === 1 ? `${names[0].name}, ${longDate(names[0].date)}` : `${shortDate(names[0].date)} and others`}`);
  const skipped = data.length - r.count;
  return done(`Added ${r.count} ${r.count === 1 ? "holiday" : "holidays"} to ${where}${skipped ? ` (${skipped} already there)` : ""}.`);
}

/** Removes a holiday everywhere it is listed: the ids are every office's copy of that holiday, as the list groups them. Admins only. */
export async function removeHoliday(_: TimeOffResult, form: FormData): Promise<TimeOffResult> {
  const me = await requireTab("time-off");
  const denied = holidayError(me);
  if (denied) return fail(denied);
  const settings = await getSettings();
  const ids = String(form.get("id") ?? "").split(",").filter(Boolean);
  const rows = ids.length ? await db.holiday.findMany({ where: { id: { in: ids } }, include: { location: { select: { name: true } } } }) : [];
  if (!rows.length) return fail("That holiday isn't there any more.");
  const d = toStr(rows[0].date);
  if (settings.lockBeforeStr && d <= settings.lockBeforeStr) return fail(`${LOCKED} A holiday on or before ${longDate(settings.lockBeforeStr)} can't be removed.`);
  await db.holiday.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  const where = rows.length === 1 ? rows[0].location.name : `${rows.length} offices`;
  await logAction(me.id, `Removed public holiday ${rows[0].name}, ${longDate(d)} for ${where}`);
  return done();
}
