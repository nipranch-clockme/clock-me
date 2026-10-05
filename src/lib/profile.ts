import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Me } from "./auth";
import { visibleUsersWhere } from "./scope";
import { getSettings } from "./settings";
import { endOfMonth, isDateStr, today, toDate, toStr } from "./dates";

/** Someone whose profile this person may open: anyone whose time they can already see, or null. */
export const findVisiblePerson = (me: Me, id: string) =>
  db.user.findFirst({ where: { AND: [{ id }, visibleUsersWhere(me)] }, include: { team: true, location: true } });

export type ProfileFields = { employeeId?: string | null; joiningDate?: Date | null; weeklyTarget?: number };
export const DUP_EMPLOYEE_ID = "Someone else already has that employee ID.";

/**
 * Reads and checks employee ID, joining date and expected hours per week from a form (People or a profile).
 * A field the form doesn't send is left as it is. `personId` is who's being changed, so their own ID isn't a clash.
 */
export async function readProfileFields(form: FormData, personId?: string): Promise<{ error: string } | { data: ProfileFields }> {
  await getSettings(); // sets the company time zone, so "the future" starts at the company's tomorrow
  const data: ProfileFields = {};
  if (form.has("weeklyTarget")) {
    const v = parseFloat(String(form.get("weeklyTarget")));
    if (isNaN(v) || v < 0 || v > 80) return { error: "Expected hours per week should be between 0 and 80." };
    data.weeklyTarget = v;
  }
  if (form.has("employeeId")) {
    const v = String(form.get("employeeId")).replace(/\s+/g, " ").trim();
    if (v.length > 32) return { error: "Employee ID can be up to 32 characters." };
    if (v && (await db.user.findFirst({ where: { employeeId: { equals: v, mode: "insensitive" }, ...(personId ? { id: { not: personId } } : {}) }, select: { id: true } }))) return { error: DUP_EMPLOYEE_ID };
    data.employeeId = v || null;
  }
  if (form.has("joiningDate")) {
    const v = String(form.get("joiningDate")).trim();
    if (v && !isDateStr(v)) return { error: "Enter the joining date as a date, like 2021-03-12." };
    if (v && v > today()) return { error: "Joining date can't be in the future." };
    if (v && v < "1950-01-01") return { error: "Check the joining date. It's before 1950." };
    data.joiningDate = v ? toDate(v) : null;
  }
  return { data };
}

/** True when a save failed because two people would share an employee ID (two saves at the same moment). */
export const isDupEmployeeId = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes("employeeId");

/** What changed, for the change log. */
export function profileChanges(before: { employeeId: string | null; joiningDate: Date | null; weeklyTarget: number }, after: ProfileFields) {
  return [
    after.employeeId !== undefined && after.employeeId !== before.employeeId && (after.employeeId ? `employee ID to ${after.employeeId}` : "removed employee ID"),
    after.joiningDate !== undefined && (after.joiningDate ? toStr(after.joiningDate) : null) !== (before.joiningDate ? toStr(before.joiningDate) : null) && (after.joiningDate ? `joining date to ${toStr(after.joiningDate)}` : "removed joining date"),
    after.weeklyTarget !== undefined && after.weeklyTarget !== before.weeklyTarget && `expected hours per week to ${after.weeklyTarget} h`,
  ].filter((x): x is string => !!x);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Mar 2021" */
export const dayMonthYear = (s: string) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;

/** "Joined 12 Mar 2021 · 4 years 6 months", "Joined this month" when it's been under a month, or "Joining date not set". */
export function joinedText(joiningDate: Date | null) {
  if (!joiningDate) return "Joining date not set";
  const j = toStr(joiningDate), t = today();
  const [jy, jm, jd] = j.split("-").map(Number), [ty, tm, td] = t.split("-").map(Number);
  // Whole months since joining. Someone who joined on the 31st has a full month on the last day of a shorter month.
  const months = (ty - jy) * 12 + (tm - jm) - (td < Math.min(jd, +endOfMonth(t.slice(0, 7)).slice(8)) ? 1 : 0);
  if (months < 1) return "Joined this month";
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : "");
  return `Joined ${dayMonthYear(j)} · ${[part(Math.floor(months / 12), "year"), part(months % 12, "month")].filter(Boolean).join(" ")}`;
}

// Profile pictures arrive as a small JPEG made in the browser (a 256x256 square). The server still checks what it gets.
export const MAX_PHOTO_BYTES = 512 * 1024;
export const MAX_PHOTO_SIDE = 1024;

/** Width and height of a JPEG, or null when the bytes aren't one. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // padding
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; } // markers with no length
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    if (m === 0xd9 || m === 0xda) return null; // image data or the end, and still no size
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}
