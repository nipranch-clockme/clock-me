import type { Prisma } from "@prisma/client";
import type { Me } from "./auth";
import { db } from "./db";
import { visibleUsersWhere } from "./scope";
import { RANGES, rangeDates, toDate, toStr, isDateStr, addDays, addMonths, endOfMonth, monday, dow, daysBetween } from "./dates";

/** What a report can be grouped by (the first level, and optionally a second level inside it). */
export const GROUPS: [string, string][] = [
  ["project", "Project"], ["client", "Client"], ["person", "Person"], ["team", "Team"], ["location", "Location"],
  ["tag", "Tag"], ["phase", "Phase"], ["description", "Description"], ["day", "Day"], ["month", "Month"],
];
/** Groupings that are periods of time: shown in date order, not biggest first, and without colours. */
export const TIME_GROUPS = ["day", "month"];

export const FILTER_KEYS = ["person", "team", "client", "project", "phase", "tag", "status", "location"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
/** The timesheet status of the week an entry belongs to. */
export const STATUSES: [string, string][] = [["DRAFT", "Not submitted"], ["SUBMITTED", "Submitted"], ["APPROVED", "Approved"], ["REJECTED", "Sent back"]];
export const TABS = [["summary", "Summary"], ["detailed", "Detailed"], ["weekly", "Weekly"]] as const;
export type Tab = (typeof TABS)[number][0];

export type ReportParams = {
  tab: Tab; range: string; from?: string; to?: string; group: string; group2?: string; est?: string; desc?: string;
} & Record<FilterKey, string[]>;

type SP = Record<string, string | string[] | undefined>;

/** URL search params to the same shape the page gets from Next (repeated keys become a list). */
export function spToRecord(sp: URLSearchParams): SP {
  const out: Record<string, string | string[]> = {};
  sp.forEach((v, k) => { const cur = out[k]; out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]; });
  return out;
}

export function parseReportParams(sp: SP, me: Me): ReportParams {
  const s = (k: string) => { const v = Array.isArray(sp[k]) ? (sp[k] as string[])[0] : sp[k]; return typeof v === "string" && v ? v : undefined; };
  const list = (k: string) => { const v = sp[k]; const a = Array.isArray(v) ? v : v ? [v] : []; return [...new Set(a.filter(Boolean))].slice(0, 300); };
  const group = GROUPS.some((g) => g[0] === s("group")) ? s("group")! : "project";
  const tab = TABS.find((t) => t[0] === s("tab"))?.[0] ?? (s("detail") === "1" ? "detailed" : "summary"); // `detail=1` is how older links asked for the Detailed view
  const p: ReportParams = {
    tab, range: s("range") ?? "thismonth", group,
    group2: GROUPS.some((g) => g[0] === s("group2")) && s("group2") !== group ? s("group2") : undefined,
    est: s("est") === "1" && group === "project" ? "1" : undefined,
    desc: s("desc")?.slice(0, 200),
    person: list("person"), team: list("team"), client: list("client"), project: list("project"), phase: list("phase"), tag: list("tag"),
    status: list("status").filter((x) => STATUSES.some((t) => t[0] === x)), location: me.role === "ADMIN" ? list("location") : [], // only admins filter by office
  };
  if (p.range === "custom" && isDateStr(s("from")) && isDateStr(s("to"))) {
    const preset = RANGES.find(([k]) => k !== "custom" && k !== "all" && rangeDates(k).join() === `${s("from")},${s("to")}`);
    if (preset) p.range = preset[0]; // stepping with the arrows lands on "Last week" etc. when it matches
    else { p.from = s("from"); p.to = s("to"); }
  } else if (p.range === "custom") { p.from = isDateStr(s("from")) ? s("from") : undefined; p.to = isDateStr(s("to")) ? s("to") : undefined; }
  return p;
}

/** The period just before or after the one shown, as a custom range: a week steps by a week, a month by a month, and so on. */
export function stepRange(from: string, to: string, dir: 1 | -1): [string, string] {
  const span = daysBetween(from, to) + 1;
  const ym = from.slice(0, 7), mo = +from.slice(5, 7);
  if (span === 7 && dow(from) === 0) return [addDays(from, 7 * dir), addDays(to, 7 * dir)];
  const whole = (n: number) => from.endsWith("-01") && to === endOfMonth(addMonths(ym, n - 1));
  const months = whole(12) && mo === 1 ? 12 : whole(3) && (mo - 1) % 3 === 0 ? 3 : whole(1) ? 1 : 0; // a whole year, quarter or month
  if (months) { const a = addMonths(ym, months * dir); return [a + "-01", endOfMonth(addMonths(a, months - 1))]; }
  return [addDays(from, span * dir), addDays(to, span * dir)];
}

/**
 * Entries matching the report filters, limited to the people this viewer can see.
 * The Status filter is about the timesheet of the week an entry sits in, so it first looks up those timesheets.
 */
export async function reportWhere(me: Me, p: ReportParams): Promise<{ where: Prisma.TimeEntryWhereInput; from: string; to: string; statusTooWide: boolean }> {
  const [from, to] = rangeDates(p.range, p.from, p.to);
  const user: Prisma.UserWhereInput = { AND: [visibleUsersWhere(me), p.team.length ? { teamId: { in: p.team } } : {}, p.location.length ? { locationId: { in: p.location } } : {}] };
  const and: Prisma.TimeEntryWhereInput[] = [];
  let statusTooWide = false;
  if (p.status.length && p.status.length < STATUSES.length) {
    const sel = new Set(p.status);
    const sheets = await db.timesheet.findMany({
      where: { user: visibleUsersWhere(me), weekStart: { gte: toDate(monday(from)), lte: toDate(to) } },
      select: { userId: true, weekStart: true, status: true }, orderBy: [{ userId: "asc" }, { weekStart: "asc" }],
    });
    // A week with no timesheet saved yet counts as "Not submitted". Neighbouring weeks of one person are merged into one date range.
    const ranges = (list: typeof sheets) => {
      const out: { userId: string; date: { gte: Date; lte: Date } }[] = [];
      for (const s of list) {
        const end = toDate(addDays(toStr(s.weekStart), 6)), last = out[out.length - 1];
        if (last && last.userId === s.userId && toStr(last.date.lte) === addDays(toStr(s.weekStart), -1)) last.date.lte = end;
        else out.push({ userId: s.userId, date: { gte: s.weekStart, lte: end } });
      }
      return out;
    };
    const use = sel.has("DRAFT") ? ranges(sheets.filter((s) => !sel.has(s.status))) : ranges(sheets.filter((s) => sel.has(s.status)));
    if (use.length > 3000) { statusTooWide = true; and.push({ id: { in: [] } }); }
    else if (sel.has("DRAFT")) { if (use.length) and.push({ NOT: { OR: use } }); }
    else and.push(use.length ? { OR: use } : { id: { in: [] } });
  }
  const where: Prisma.TimeEntryWhereInput = {
    date: { gte: toDate(from), lte: toDate(to) },
    user,
    ...(p.person.length ? { userId: { in: p.person } } : {}),
    ...(p.project.length ? { projectId: { in: p.project } } : {}),
    ...(p.client.length ? { project: { clientId: { in: p.client } } } : {}),
    ...(p.tag.length ? { tagIds: { hasSome: p.tag } } : {}), // any of the ticked tags
    ...(p.phase.length ? { phase: { name: { in: p.phase } } } : {}),
    ...(p.desc ? { description: { contains: p.desc, mode: "insensitive" } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
  return { where, from, to, statusTooWide };
}

export function reportQuery(p: ReportParams, extra: Record<string, string | string[] | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...extra })) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v && !(k === "tab" && v === "summary")) q.set(k, v);
  }
  return q.toString();
}

export function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
