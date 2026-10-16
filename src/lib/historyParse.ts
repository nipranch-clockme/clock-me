// Reads a Clockify "Detailed report" CSV into a compact plan for Settings > Import history.
// Free of database code: it runs in the browser, so the file never has to be sent in one piece.
import { csvObjects } from "./csv";
import { addDays } from "./dates";

export type HistoryRole = "MEMBER" | "LEADER" | "LOCATION" | "GUEST" | "ADMIN";
export type HistoryPerson = { email: string; name: string; office: string; team: string | null; role: HistoryRole };
/** A project with the phases its time uses, in the order they first appear. */
export type HistoryProject = { client: number; name: string; phases: string[] };
/** [person, project, phase (index into that project's phases), description, tags (indexes), date, start minute, minutes] */
export type HistoryEntry = [number, number, number, string, number[], string, number, number];
export type HistoryPlan = {
  people: HistoryPerson[]; clients: string[]; projects: HistoryProject[]; tags: string[]; entries: HistoryEntry[];
  offices: string[]; teams: { office: string; name: string }[];
  from: string; to: string; minutes: number; skipped: string[]; split: number; fileKey: string;
};

/** Time with no Task goes into this phase. */
export const DEFAULT_PHASE = "Submission 1";
const DAY = 24 * 60;

const ROLE_WORDS: Record<string, HistoryRole> = {
  "team member": "MEMBER", member: "MEMBER", "": "MEMBER",
  "team/project manager": "LEADER", "team manager": "LEADER", "project manager": "LEADER", manager: "LEADER",
  "location manager": "LOCATION", admin: "ADMIN", guest: "GUEST",
};

/** "10/15/2026" (month first, as Clockify writes it) or "2026-10-15". */
function day(s: string): string | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [mo, d] = [+m[1], +m[2]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** "18:15:00", "18:15" or "6:15 PM" to minutes after midnight. */
function clock(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = +m[1];
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0); }
  return h < 24 && +m[2] < 60 ? h * 60 + +m[2] : null;
}
/** "0.50" (hours) from Duration (decimal), else "00:30:00" from Duration (h). */
function length(dec: string, hms: string): number | null {
  if (dec && /^\d+(\.\d+)?$/.test(dec)) return Math.round(+dec * 60);
  const m = hms.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  return m ? +m[1] * 60 + +m[2] + Math.round(+(m[3] ?? 0) / 60) : null;
}
const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** A short fingerprint of the file, so a stopped import only continues with the same file. */
function fingerprint(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(36)}-${s.length}`;
}

/**
 * Reads the file. Columns used: Project, Client, Description, Task, User, Group, Email, Tags, Start Date, Start Time,
 * End Date, Duration (decimal) or Duration (h), and an optional Role. Group is "OFFICE-Team"; a person listed under
 * several teams ("AMD-Batman, AMD-Flash") has no team of their own. Rows that can't be read are left out and listed.
 * An entry that runs past midnight is split, the rest going on the next day from 00:00.
 */
export function parseHistory(text: string): { plan: HistoryPlan } | { error: string } {
  const { keys, rows, error } = csvObjects(text);
  if (error) return { error };
  const need = ["project", "client", "email", "start date", "start time"];
  const missing = need.filter((k) => !keys.includes(k));
  if (missing.length) return { error: `This doesn't look like a Clockify detailed report: it has no ${missing.join(", ")} column.` };
  if (!keys.includes("duration (decimal)") && !keys.includes("duration (h)")) return { error: "The file has no Duration column." };

  const people = new Map<string, HistoryPerson>();
  const clients = new Map<string, number>(), clientNames: string[] = [];
  const projects = new Map<string, number>(), projectList: HistoryProject[] = [];
  const tags = new Map<string, number>(), tagNames: string[] = [];
  const offices = new Set<string>(), teams = new Map<string, { office: string; name: string }>();
  const personIdx = new Map<string, number>();
  const entries: HistoryEntry[] = [];
  const skipped: string[] = [];
  let from = "", to = "", minutes = 0, split = 0;
  const idx = <T>(map: Map<string, number>, list: T[], k: string, make: () => T) => {
    let i = map.get(k);
    if (i === undefined) { i = list.length; list.push(make()); map.set(k, i); }
    return i;
  };

  for (const { line, v } of rows) {
    const skip = (why: string) => { skipped.push(`Line ${line}: ${why}`); };
    const email = v["email"].toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skip("no valid email"); continue; }
    const groups = (v["group"] ?? "").split(",").map((g) => g.trim()).filter(Boolean);
    const parts = groups.map((g) => { const i = g.indexOf("-"); return i > 0 ? { office: g.slice(0, i).trim(), team: g.slice(i + 1).trim() } : null; });
    if (!parts.length || parts.some((p) => !p || !p.office || !p.team)) { skip(`Group "${v["group"] ?? ""}" isn't written as OFFICE-Team`); continue; }
    const office = parts[0]!.office;
    if (parts.some((p) => key(p!.office) !== key(office))) { skip(`Group "${v["group"]}" names more than one office`); continue; }
    const roleWord = key(v["role"] ?? "");
    if (!(roleWord in ROLE_WORDS)) { skip(`Unknown role "${v["role"]}"`); continue; }
    const date = day(v["start date"]), start = clock(v["start time"]), mins = length(v["duration (decimal)"] ?? "", v["duration (h)"] ?? "");
    if (!date) { skip(`Start Date "${v["start date"]}" isn't a date`); continue; }
    if (start === null) { skip(`Start Time "${v["start time"]}" isn't a time`); continue; }
    if (!mins || mins <= 0) { skip("no duration"); continue; }
    const projectName = v["project"].trim().replace(/\s+/g, " "), clientName = v["client"].trim().replace(/\s+/g, " ");
    if (!projectName) { skip("no project"); continue; }
    if (!clientName) { skip("no client"); continue; }

    if (!people.has(email)) {
      const role = parts.length > 1 && !roleWord ? "LOCATION" : ROLE_WORDS[roleWord];
      people.set(email, { email, name: (v["user"] ?? "").trim() || email.split("@")[0], office, team: parts.length === 1 ? parts[0]!.team : null, role });
      personIdx.set(email, personIdx.size);
    }
    offices.add(office);
    for (const p of parts) teams.set(key(p!.office) + "|" + key(p!.team), { office: p!.office, name: p!.team });

    const c = idx(clients, clientNames, key(clientName), () => clientName);
    const pj = idx(projects, projectList, c + "|" + key(projectName), () => ({ client: c, name: projectName, phases: [] as string[] }));
    const phaseName = (v["task"] ?? "").trim() || DEFAULT_PHASE;
    const ph = projectList[pj].phases;
    let phi = ph.findIndex((x) => key(x) === key(phaseName));
    if (phi < 0) { phi = ph.length; ph.push(phaseName); }
    const tg = [...new Set((v["tags"] ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => idx(tags, tagNames, key(t), () => t)))];
    const desc = (v["description"] ?? "").trim();
    const who = personIdx.get(email)!;

    // Past midnight: fill the day to 24:00, then carry on from 00:00 the next day.
    let d = date, s = start, left = mins;
    if (s + left > DAY) split++;
    while (left > 0) {
      const part = Math.min(left, DAY - s);
      entries.push([who, pj, phi, desc, tg, d, s, part]);
      if (!from || d < from) from = d;
      if (!to || d > to) to = d;
      left -= part; d = addDays(d, 1); s = 0;
    }
    minutes += mins;
  }
  if (!entries.length) return { error: skipped.length ? `None of the rows could be read. ${skipped.slice(0, 3).join(" ")}` : "The file has no time in it." };
  return {
    plan: {
      people: [...people.values()], clients: clientNames, projects: projectList, tags: tagNames, entries,
      offices: [...offices], teams: [...teams.values()], from, to, minutes, skipped, split, fileKey: fingerprint(text),
    },
  };
}
