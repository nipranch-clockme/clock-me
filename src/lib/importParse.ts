// Small, dependency-free helpers for reading CSV imports (people, projects, timesheet). Kept free of database code so they can be tested on their own.

export type RoleName = "MEMBER" | "LEADER" | "LOCATION" | "ADMIN";

/** The first non-empty value among a row's columns, trying each name in order. */
export const pick = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) if (r[n]?.trim()) return r[n].trim();
  return "";
};

/** True when the file has at least one of these columns (even if some rows leave it blank). */
export const hasColumn = (keys: string[], ...names: string[]) => names.some((n) => keys.includes(n));

/** Splits "a, b; c" into ["a", "b", "c"]: commas and semicolons both separate, blanks and repeats (ignoring case) drop out. */
export function splitList(s: string | undefined) {
  const seen = new Set<string>(), out: string[] = [];
  for (const part of (s ?? "").split(/[;,]/)) {
    const v = part.trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}

const realDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** 2026-03-31 or 03/31/2026 (month first, like the templates) to 2026-03-31, or null when it isn't a real date. */
export function parseDateFlexible(s: string): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3]; }
  else return null;
  if (y < 1990 || y > 2100 || !realDate(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 09:30, 9:30, 17:00, 9:30 AM or 12:00 PM to minutes after midnight, or null. Minutes need two digits. */
export function parseTimeFlexible(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = +m[1];
  const ap = m[3]?.toLowerCase();
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === "pm" ? 12 : 0); }
  else if (h > 23) return null;
  return h * 60 + +m[2];
}

const ROLE_WORDS: [RegExp, RoleName][] = [
  [/^admin(istrator)?$/, "ADMIN"],
  [/^(location|office)( manager)?$/, "LOCATION"],
  [/^(team|project|team\/project|project\/team)( manager| leader)?$|^(manager|leader|team leader)$/, "LEADER"],
  [/^(team member|member|regular user|regular|user|employee)$/, "MEMBER"],
];
const ROLE_RANK: Record<RoleName, number> = { MEMBER: 0, LEADER: 1, LOCATION: 2, ADMIN: 3 };

/**
 * Turns Clockify-style role text ("Admin, Project Manager", "Team Manager", blank) into the highest role named.
 * Blank means Team Member. `unknown` lists words that mean nothing to us, so the row can be refused instead of guessed.
 */
export function parseRole(s: string | undefined): { role: RoleName; unknown: string[] } {
  let role: RoleName = "MEMBER";
  const unknown: string[] = [];
  for (const part of (s ?? "").split(/[;,]/)) {
    const w = part.trim().toLowerCase().replace(/\s+/g, " ");
    if (!w) continue;
    const hit = ROLE_WORDS.find(([re]) => re.test(w));
    if (!hit) unknown.push(part.trim());
    else if (ROLE_RANK[hit[1]] > ROLE_RANK[role]) role = hit[1];
  }
  return { role, unknown };
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
/** How many different weekdays a cell like "Mon, Tue, Wed, Thu, Fri" names (full names work too). */
export const countWeekdays = (s: string | undefined) => new Set(splitList(s).map((x) => x.toLowerCase().slice(0, 3)).filter((x) => WEEKDAYS.includes(x))).size;

/**
 * Expected hours per week from a daily capacity and the working days: 8 x 5 = 40.
 * undefined when the file gives neither (use the default), null when what it gives can't be used.
 */
export function weeklyFromCapacity(capacity: string | undefined, days: string | undefined): number | null | undefined {
  const c = (capacity ?? "").trim(), d = (days ?? "").trim();
  if (!c && !d) return undefined;
  let hours = NaN;
  const hm = c.match(/^(\d{1,2}):([0-5]\d)$/);
  if (hm) hours = +hm[1] + +hm[2] / 60;
  else if (/^\d+(\.\d+)?$/.test(c)) hours = parseFloat(c);
  const n = d ? countWeekdays(d) : 5; // no days given: a normal five-day week
  if (!(hours >= 0 && hours <= 24) || !n) return null;
  return Math.round(hours * n * 100) / 100;
}

/** "Name" or "Name:Client" (how Clockify writes a project when two clients share a name) as the possible readings. */
export function projectRefs(entry: string): { name: string; client?: string }[] {
  const out: { name: string; client?: string }[] = [{ name: entry.trim() }];
  for (let i = entry.indexOf(":"); i >= 0; i = entry.indexOf(":", i + 1)) out.push({ name: entry.slice(0, i).trim(), client: entry.slice(i + 1).trim() });
  return out.filter((x) => x.name);
}

/** A name as it will be saved: control characters and line breaks become spaces, runs of spaces collapse, ends are trimmed. */
export const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** A duration as "1.5", "1:30", "08:00:00" (hours:minutes:seconds, as spreadsheets and Clockify write it), "1h 30m" or "90m", in minutes. NaN when it isn't one. */
export function parseDurationFlexible(s: string): number {
  const v = s.trim();
  let m = v.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return +m[2] < 60 && +m[3] < 60 ? +m[1] * 60 + +m[2] + Math.round(+m[3] / 60) : NaN;
  m = v.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 60);
  m = v.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  return m && (m[1] || m[2]) ? Math.round(+(m[1] || 0) * 60 + +(m[2] || 0)) : NaN;
}

/** Everyone / Public (or blank) or Restricted / Private. Any other word is null, so a typo can't quietly open up a restricted project. */
export function parseAccess(s: string | undefined): "PUBLIC" | "RESTRICTED" | null {
  const v = (s ?? "").trim().toLowerCase();
  if (!v || v === "everyone" || v === "public") return "PUBLIC";
  return v === "restricted" || v === "private" ? "RESTRICTED" : null;
}

/** Budget hours: blank or 0 is no budget; otherwise a plain number up to 100000. NaN when it isn't one. */
export function parseBudget(s: string | undefined): number | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  if (!/^\d+(\.\d+)?$/.test(v)) return NaN;
  const n = parseFloat(v);
  return n > 100000 ? NaN : n || null;
}

/** The colours new clients cycle through (the same five as adding a client by hand). */
export const CLIENT_COLORS = ["s1", "s2", "s3", "s8", "s6"];

/** Case-insensitive, whitespace-tolerant key for matching names typed by different people. */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
