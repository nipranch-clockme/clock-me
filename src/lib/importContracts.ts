import type { ClientStatus } from "@prisma/client";
import { db } from "./db";
import { EXTRA_CELLS, csvObjects } from "./csv";
import { toDate } from "./dates";
import { CLIENT_COLORS, clean, nameKey, pick } from "./importParse";
import { columnNotes, type PreviewRow } from "./importTypes";
import { contractOf } from "./clients";
import { CLIENT_STATUS, labelOf } from "./clientStatus";

export const MAX_CONTRACT_ROWS = 2000;
const MAX_HOURS = 100000; // the same ceiling as the Monthly contracts table
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const USED = ["client", "client name", "team", "office", "location", "status", "contract", "year", "work types", "work type", ...MONTHS, ...SHORT];
const IGNORED: Record<string, string> = { "year total": "the app adds up the months itself", "per day": "worked out from the months", "per week": "worked out from the months" };
/** Words a spreadsheet uses for a client with no team. */
const NO_TEAM = new Set(["unassigned", "none", "no team", "-"]);

/** Contracted, Project based (or Non-contracted) and Lost (or Ended). Blank leaves the status as it is; null is a word we don't know. */
export function parseStatus(s: string): ClientStatus | "" | null {
  const v = s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!v) return "";
  if (v === "contracted") return "CONTRACTED";
  if (v === "project based" || v === "non contracted" || v === "not contracted") return "PROJECT_BASED";
  if (v === "lost" || v === "ended") return "LOST";
  return null;
}

/** "CAD + ENG", "CAD/ENG", "CAD, REVIT" or "CAD (VISIO+DTOOL)" as separate names. */
export const splitWorkTypes = (s: string) => [...new Set(s.split(/[+,/;()]/).map(clean).filter(Boolean))];

/** A month's hours: blank is 0, otherwise a plain number up to 100000. NaN when it isn't one. */
export function parseMonthHours(s: string | undefined): number {
  const v = (s ?? "").trim().replace(/,/g, "");
  if (!v) return 0;
  if (!/^\d+(\.\d+)?$/.test(v)) return NaN;
  const n = parseFloat(v);
  return n > MAX_HOURS ? NaN : Math.round(n * 100) / 100;
}

export type ContractDraft = {
  clientId?: string; clientName: string;
  team: { id?: string; name: string; locationId: string } | null | undefined; // undefined leaves the team as it is, null takes it away
  status?: ClientStatus; workTypeIds?: string[];
  year: number; hours: number[]; // the twelve months of the year, January first
};

/** Reads a Client contracts file and says what would happen to each client. Nothing is saved here. */
export async function checkContracts(text: string) {
  const { keys, rows, total, error: unreadable } = csvObjects(text, MAX_CONTRACT_ROWS);
  if (unreadable) return { error: unreadable };
  if (!keys.includes("client") && !keys.includes("client name")) return { error: "The first row must name a Client column." };
  const monthKey = MONTHS.map((m, i) => (keys.includes(m) ? m : keys.includes(SHORT[i]) ? SHORT[i] : null));
  const missing = MONTHS.filter((_, i) => !monthKey[i]);
  if (missing.length) return { error: `The first row must have a column for every month, January to December. Missing: ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(", ")}.` };
  if (!keys.includes("year")) return { error: "The first row must have a Year column, like 2026." };
  if (!total) return { error: "That file has no clients in it, only the first row." };
  if (total > MAX_CONTRACT_ROWS) return { error: `That file has ${total.toLocaleString("en-US")} rows. Import at most ${MAX_CONTRACT_ROWS.toLocaleString("en-US")} at a time.` };

  const [clients, teams, locations, tags] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true } }),
    db.team.findMany({ select: { id: true, name: true, locationId: true } }),
    db.location.findMany({ select: { id: true, name: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
  ]);
  const seen = new Map<string, number>();
  const newClients = new Map<string, string>(), newTeams = new Map<string, string>();

  const out = rows.map(({ line, extra, v: r }) => {
    const notes: string[] = [];
    const clientName = clean(pick(r, "client", "client name"));
    const client = clients.find((c) => nameKey(c.name) === nameKey(clientName));
    const yearText = pick(r, "year");
    const year = /^\d{4}$/.test(yearText) ? +yearText : NaN;
    const hours = monthKey.map((k) => parseMonthHours(r[k!]));
    const st = parseStatus(pick(r, "status", "contract"));
    const teamName = clean(pick(r, "team"));
    const officeName = clean(pick(r, "office", "location"));
    const office = locations.find((l) => nameKey(l.name) === nameKey(officeName));
    const noTeam = NO_TEAM.has(teamName.toLowerCase());
    const officeTeams = teams.filter((t) => nameKey(t.name) === nameKey(teamName) && (!office || t.locationId === office.id));
    const wtText = pick(r, "work types", "work type");
    const wanted = splitWorkTypes(wtText);
    const tagIds = wanted.map((w) => tags.find((t) => nameKey(t.name) === nameKey(w))?.id);
    const key = nameKey(clientName);
    const first = seen.get(key);
    const error =
      extra ? EXTRA_CELLS
      : !clientName ? "No client name"
      : clientName.length > 120 ? "Client name is too long"
      : first ? `Same client as row ${first}`
      : isNaN(year) || year < 2000 || year > 2100 ? "Year must be like 2026"
      : hours.some(isNaN) ? "Each month must be a number of hours (blank means 0)"
      : st === null ? "Status must be Contracted, Project based or Lost"
      : teamName && !noTeam && officeName && !office ? `Unknown office ${officeName}`
      : teamName && !noTeam && !office && officeTeams.length !== 1 ? (officeTeams.length ? "Two offices have this team: add an Office column" : `Unknown team ${teamName} (add its Office to create it)`)
      : tagIds.includes(undefined) ? `Unknown work type ${wanted.filter((_, i) => !tagIds[i]).join(", ")} (use tags that exist)`
      : "";
    let team: ContractDraft["team"];
    if (!error) {
      seen.set(key, line);
      if (!client) { notes.push("New client"); newClients.set(key, clientName); }
      if (noTeam) team = null;
      else if (teamName) {
        const t = officeTeams[0];
        team = t ? { id: t.id, name: t.name, locationId: t.locationId } : { name: teamName, locationId: office!.id };
        if (!t) { notes.push(`New team ${teamName} in ${office!.name}`); newTeams.set(`${office!.id}|${nameKey(teamName)}`, `${teamName} (${office!.name})`); }
      }
    }
    const row: PreviewRow = {
      line, error, notes,
      cells: [clientName, noTeam ? "No team" : teamName, st ? labelOf(CLIENT_STATUS, st) : "", Number.isNaN(year) ? yearText : String(year),
        hours.map((h) => (isNaN(h) ? "?" : String(h))).join(" · "), wanted.join(", ")],
    };
    const data: ContractDraft | undefined = error ? undefined : {
      clientId: client?.id, clientName, team, year, hours,
      ...(st ? { status: st } : {}), ...(wtText ? { workTypeIds: tagIds as string[] } : {}),
    };
    return { row, data };
  });

  const adds = [
    ...(newClients.size ? [`New clients: ${[...newClients.values()].join(", ")}`] : []),
    ...(newTeams.size ? [`New teams: ${[...newTeams.values()].join(", ")}`] : []),
  ];
  return {
    headers: ["Client", "Team", "Status", "Year", "Hours, January to December", "Work types"],
    columnNotes: columnNotes(keys, USED, IGNORED, [], rows.map((r) => r.v)),
    adds, out,
  };
}

/** Saves every checked client together (or none, if anything fails): team, status, work types and the twelve months' contracted hours. */
export async function saveContracts(drafts: ContractDraft[]) {
  return db.$transaction(async (tx) => {
    let n = 0;
    for (const d of drafts) {
      let teamId: string | null | undefined;
      if (d.team === null) teamId = null;
      else if (d.team) {
        teamId = d.team.id
          ?? (await tx.team.findFirst({ where: { locationId: d.team.locationId, name: { equals: d.team.name, mode: "insensitive" } } }))?.id
          ?? (await tx.team.create({ data: { name: d.team.name, locationId: d.team.locationId } })).id;
      }
      const data = { ...(teamId !== undefined ? { teamId } : {}), ...(d.status ? { status: d.status } : {}), ...(d.workTypeIds ? { workTypeIds: d.workTypeIds } : {}) };
      const existing = d.clientId ? await tx.client.findUnique({ where: { id: d.clientId } })
        : await tx.client.findFirst({ where: { name: { equals: d.clientName, mode: "insensitive" } } });
      const client = existing
        ? await tx.client.update({ where: { id: existing.id }, data })
        : await tx.client.create({ data: { name: d.clientName, color: CLIENT_COLORS[(await tx.client.count()) % CLIENT_COLORS.length], ...data } });
      // As in the Monthly contracts table: a month that matches the client's usual hours has no row of its own.
      const usual = contractOf(client) ?? 0;
      const months = d.hours.map((h, i) => ({ month: toDate(`${d.year}-${String(i + 1).padStart(2, "0")}-01`), hours: h }));
      await tx.clientMonth.deleteMany({ where: { clientId: client.id, month: { in: months.map((m) => m.month) } } });
      const own = months.filter((m) => m.hours !== usual);
      if (own.length) await tx.clientMonth.createMany({ data: own.map((m) => ({ clientId: client.id, ...m })) });
      n++;
    }
    return n;
  }, { maxWait: 10_000, timeout: 120_000 });
}
