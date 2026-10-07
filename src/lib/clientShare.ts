import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { RANGES, rangeDates, toDate, toStr, isDateStr } from "./dates";

/** A client's view-only report: what the shared page and its CSV show. Only project, hours and tag are ever read here, never people, descriptions or phases. */

export const SHARE_PATH = "/share";
export const NO_TAG = "none"; // the filter value for time with no tag
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** A new secret for a client's link: 24 random bytes, 32 characters of URL-safe text. */
export const newShareToken = () => randomBytes(24).toString("base64url");
export const looksLikeToken = (t: string) => TOKEN_RE.test(t);

type SP = Record<string, string | string[] | undefined>;
export type ShareParams = { range: string; from?: string; to?: string; by: "project" | "tag"; project: string[]; tag: string[] };

/** The shared page's URL parameters, cleaned. Repeated keys (several ticked projects) become a list. */
export function parseShareParams(sp: SP): ShareParams {
  const s = (k: string) => { const v = Array.isArray(sp[k]) ? (sp[k] as string[])[0] : sp[k]; return typeof v === "string" && v ? v : undefined; };
  const list = (k: string) => { const v = sp[k]; const a = Array.isArray(v) ? v : v ? [v] : []; return [...new Set(a.filter((x) => typeof x === "string" && x && x.length <= 40))].slice(0, 300); };
  const range = RANGES.some(([k]) => k === s("range")) ? s("range")! : "all";
  const p: ShareParams = { range, by: s("by") === "tag" ? "tag" : "project", project: list("project"), tag: list("tag") };
  if (range === "custom") { p.from = isDateStr(s("from")) ? s("from") : undefined; p.to = isDateStr(s("to")) ? s("to") : undefined; }
  return p;
}

/** The page's own address with these parameters (filters ticked, range, grouping). */
export function shareQuery(p: ShareParams, extra: Record<string, string | string[] | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...extra })) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v && !(k === "by" && v === "project") && !(k === "range" && v === "all")) q.set(k, v);
  }
  return q.toString();
}

export type ShareRow = { date: string; projectId: string; tagId: string | null; minutes: number };

/**
 * Minutes per day, project and tag on one client's projects (archived ones included), for the dates and filters given.
 * The client always comes from the link's secret, never from the page's parameters, and the project and tag filters can only
 * narrow it: ids that don't belong to this client match nothing.
 */
export async function shareRows(client: { id: string; shareApprovedOnly: boolean }, p: ShareParams): Promise<{ rows: ShareRow[]; from: string; to: string }> {
  const [from, to] = rangeDates(p.range, p.from, p.to);
  const tagIds = p.tag.filter((t) => t !== NO_TAG);
  const tagFilter = p.tag.length
    ? Prisma.sql`AND (${tagIds.length ? Prisma.sql`e."tagId" IN (${Prisma.join(tagIds)})` : Prisma.sql`FALSE`}${p.tag.includes(NO_TAG) ? Prisma.sql` OR e."tagId" IS NULL` : Prisma.empty})`
    : Prisma.empty;
  const raw = await db.$queryRaw<{ d: Date; projectId: string; tagId: string | null; minutes: bigint }[]>(Prisma.sql`
    SELECT e.date AS d, e."projectId", e."tagId", SUM(e.minutes)::bigint AS minutes
    FROM "TimeEntry" e JOIN "Project" p ON p.id = e."projectId"
    WHERE p."clientId" = ${client.id} AND e.date >= ${toDate(from)} AND e.date <= ${toDate(to)}
    ${p.project.length ? Prisma.sql`AND e."projectId" IN (${Prisma.join(p.project)})` : Prisma.empty}
    ${tagFilter}
    ${client.shareApprovedOnly ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Timesheet" t WHERE t."userId" = e."userId" AND t.status = 'APPROVED'::"SheetStatus" AND t."weekStart" = date_trunc('week', e.date)::date)` : Prisma.empty}
    GROUP BY e.date, e."projectId", e."tagId"`);
  return { rows: raw.map((r) => ({ date: toStr(r.d), projectId: r.projectId, tagId: r.tagId, minutes: Number(r.minutes) })), from, to };
}

/** The projects and tags this client's time has ever used: the choices the filters offer (so nothing else in the company is named). */
export async function shareChoices(clientId: string) {
  const [projects, tagRows, noTag] = await Promise.all([
    db.project.findMany({ where: { clientId, entries: { some: {} } }, select: { id: true, name: true, archived: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ where: { entries: { some: { project: { clientId } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.timeEntry.findFirst({ where: { tagId: null, project: { clientId } }, select: { id: true } }),
  ]);
  return { projects, tags: [...tagRows, ...(noTag ? [{ id: NO_TAG, name: "No tag" }] : [])] };
}

/** Looks a link up by its secret. Null when the secret is wrong or the link is off (the two look the same to a visitor). */
export async function clientByShareToken(token: string) {
  if (!looksLikeToken(token)) return null;
  return db.client.findUnique({ where: { shareToken: token }, select: { id: true, name: true, color: true, shareApprovedOnly: true, shareViewedAt: true } });
}

/** Remembers that the link was opened, at most once an hour so a busy page doesn't write on every view. */
export async function noteShareViewed(clientId: string) {
  await db.client.updateMany({ where: { id: clientId, OR: [{ shareViewedAt: null }, { shareViewedAt: { lt: new Date(Date.now() - 3600_000) } }] }, data: { shareViewedAt: new Date() } });
}
