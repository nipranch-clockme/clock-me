// Small, dependency-free helpers for reading CSV imports (people, projects, timesheet). Kept free of database code so they can be tested on their own.

export type RoleName = "MEMBER" | "LEADER" | "LOCATION" | "ADMIN";

/** The first non-empty value among a row's columns, trying each name in order. */
export const pick = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) if (r[n]?.trim()) return r[n].trim();
  return "";
};

/** True when the file has at least one of these columns (even if some rows leave it blank). */
export const hasColumn = (keys: string[], ...names: string[]) => names.some((n) => keys.includes(n));

/** Splits "a, b; c" into ["a", "b", "c"]: commas and semicolons both separate, each name is tidied (see clean), blanks and repeats (ignoring case) drop out. */
export function splitList(s: string | undefined) {
  const seen = new Set<string>(), out: string[] = [];
  for (const part of (s ?? "").split(/[;,]/)) {
    const v = clean(part);
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}

const realDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** 2026-03-31 or 03/31/2026 (month first, like the templates) to 2026-03-31, or null when it isn't a real date in the years allowed (1990 to 2100 unless told otherwise). */
export function parseDateFlexible(s: string, minYear = 1990, maxYear = 2100): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3]; }
  else return null;
  if (y < minYear || y > maxYear || !realDate(y, mo, d)) return null;
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
  [/^(admin(istrator)?|owner)$/, "ADMIN"],
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

const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_INDEX: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};

/**
 * How many different weekdays a Working Days cell names: "Mon, Tue, Wed, Thu, Fri", "Monday to Friday", "Mon-Fri" or "Mon Wed Fri".
 * null when the cell is blank or anything in it isn't a day, so a typo can't quietly change someone's hours.
 */
export function parseWorkingDays(s: string | undefined): number | null {
  let v = (s ?? "").toLowerCase().replace(/[–—]/g, "-").replace(/\./g, "");
  if (!v.trim()) return null;
  v = v.replace(/([a-z]+)\s*-\s*([a-z]+)|([a-z]+)\s+(?:to|through|thru)\s+([a-z]+)/g, (m, a1, b1, a2, b2) => {
    const a = DAY_INDEX[a1 ?? a2], b = DAY_INDEX[b1 ?? b2];
    if (a === undefined || b === undefined) return m;
    const days: string[] = [];
    for (let i = a, n = 0; n < 7; n++, i = (i + 1) % 7) { days.push(DAY_NAMES[i]); if (i === b) break; }
    return ` ${days.join(" ")} `;
  });
  const days = new Set<number>();
  for (const t of v.split(/[\s,;/&]+|\band\b/).filter(Boolean)) {
    const i = DAY_INDEX[t];
    if (i === undefined) return null;
    days.add(i);
  }
  return days.size || null;
}

/** A daily capacity as hours: "8", "7.5", "7:30" or "8:00:00". NaN when it isn't one. */
export function parseCapacityHours(s: string | undefined): number {
  const c = (s ?? "").trim();
  const hm = c.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (hm) return +hm[1] + +hm[2] / 60 + (hm[3] ? +hm[3] / 3600 : 0);
  return /^\d+(\.\d+)?$/.test(c) ? parseFloat(c) : NaN;
}

/**
 * Expected hours per week from a daily capacity and the working days: 8 x 5 = 40.
 * undefined when the file gives no daily hours (use the usual week), null when what it gives can't be used.
 */
export function weeklyFromCapacity(capacity: string | undefined, days: string | undefined): number | null | undefined {
  const c = (capacity ?? "").trim(), d = (days ?? "").trim();
  if (!c && !d) return undefined;
  const n = d ? parseWorkingDays(d) : 5; // no days given: a normal five-day week
  if (!n) return null;
  if (!c) return undefined;
  const hours = parseCapacityHours(c);
  return hours >= 0 && hours <= 24 ? Math.round(hours * n * 100) / 100 : null;
}

/** Why weeklyFromCapacity gave null, in words for the person checking the file. */
export function weeklyProblem(capacity: string | undefined, days: string | undefined): string {
  const d = (days ?? "").trim(), c = (capacity ?? "").trim();
  if (d && !parseWorkingDays(d)) return "Working Days should name days like Mon, Tue, Wed (or Mon-Fri)";
  if (c) return "Daily Work Capacity should be hours like 8 or 7:30 (up to 24)";
  return "Check Working Days and Daily Work Capacity";
}

/** "Name" or "Name:Client" (how Clockify writes a project when two clients share a name) as the possible readings. */
export function projectRefs(entry: string): { name: string; client?: string }[] {
  const e = entry.trim();
  if (e.length > 200) return []; // no project name is this long, and a long cell of colons would take the server a long time to try every reading
  const out: { name: string; client?: string }[] = [{ name: e }];
  let n = 0;
  for (let i = e.indexOf(":"); i >= 0 && n < 3; i = e.indexOf(":", i + 1), n++) out.push({ name: e.slice(0, i).trim(), client: e.slice(i + 1).trim() });
  return out.filter((x) => x.name);
}

/** A name as it will be saved: control characters and line breaks become spaces, runs of spaces collapse, ends are trimmed. */
export const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** Free text (a description) as it will be saved: control characters go (a NUL can't be stored), line breaks and tabs stay, ends are trimmed. */
export const cleanText = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

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

export const EMAIL_RE = /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/;
