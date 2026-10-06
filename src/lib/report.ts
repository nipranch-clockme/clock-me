import type { Prisma } from "@prisma/client";
import type { Me } from "./auth";
import { visibleUsersWhere } from "./scope";
import { rangeDates, toDate, isDateStr } from "./dates";

export const GROUPS: [string, string][] = [
  ["project", "Project"], ["client", "Client"], ["person", "Person"], ["team", "Team"],
  ["location", "Location"], ["tag", "Tag"], ["phase", "Phase"], ["month", "Month"],
];
export const FILTER_KEYS = ["person", "team", "client", "project", "tag", "phase", "desc", "location"] as const;
export type ReportParams = { range: string; from?: string; to?: string; group: string; detail?: string } & Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export function parseReportParams(sp: Record<string, string | string[] | undefined>, me: Me): ReportParams {
  const s = (k: string) => { const v = sp[k]; return typeof v === "string" && v ? v : undefined; };
  const p: ReportParams = { range: s("range") ?? "thismonth", group: GROUPS.some((g) => g[0] === s("group")) ? s("group")! : "project" };
  if (p.range === "custom") { p.from = isDateStr(s("from")) ? s("from") : undefined; p.to = isDateStr(s("to")) ? s("to") : undefined; }
  for (const k of FILTER_KEYS) p[k] = s(k);
  if (s("detail") === "1" && p.group === "project") p.detail = "1"; // the Detailed view goes with Group by Project
  if (me.role !== "ADMIN") p.location = undefined; // only admins filter by office
  return p;
}

/** Entries matching the report filters, limited to the people this viewer can see. */
export function reportWhere(me: Me, p: ReportParams): { where: Prisma.TimeEntryWhereInput; from: string; to: string } {
  const [from, to] = rangeDates(p.range, p.from, p.to);
  const user: Prisma.UserWhereInput = { AND: [visibleUsersWhere(me), p.team ? { teamId: p.team } : {}, p.location ? { locationId: p.location } : {}] };
  const where: Prisma.TimeEntryWhereInput = {
    date: { gte: toDate(from), lte: toDate(to) },
    user,
    ...(p.person ? { userId: p.person } : {}),
    ...(p.project ? { projectId: p.project } : {}),
    ...(p.client ? { project: { clientId: p.client } } : {}),
    ...(p.tag ? { tagId: p.tag } : {}),
    ...(p.phase ? { phase: { name: p.phase } } : {}),
    ...(p.desc ? { description: p.desc } : {}),
  };
  return { where, from, to };
}

export function reportQuery(p: ReportParams, extra: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...extra })) if (v) q.set(k, v);
  return q.toString();
}

export function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
