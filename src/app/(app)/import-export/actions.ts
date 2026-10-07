"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { roleName } from "@/lib/roles";
import { emailConfigured, sendEmail } from "@/lib/email";
import { checkPeople, savePeople, type PersonDraft } from "@/lib/importPeople";
import { checkProjects, saveProjects, type ProjectDraft } from "@/lib/importProjects";
import { checkTime, saveTime, type EntryDraft } from "@/lib/importTime";
import { sampleRows } from "@/lib/importSample";
import { MAX_IMPORT_BYTES, PREVIEW_ROWS, summarise, type ImportKind, type ImportResult, type PreviewRow } from "@/lib/importTypes";

export type { ImportResult } from "@/lib/importTypes";
const KINDS: ImportKind[] = ["people", "projects", "time"];
const MAX_EMAILS = 50;

const failed = (kind: ImportKind, error: string): NonNullable<ImportResult> =>
  ({ kind, headers: [], rows: [], total: 0, summary: { ok: 0, withNotes: 0, bad: 0, reasons: [], moreReasons: 0 }, adds: [], columnNotes: [], error });

/** What the person sees: the first rows of the file, then every later row that has a problem or a heads-up, so none of those is out of sight. */
const shown = (kind: ImportKind, c: { headers: string[]; columnNotes: string[]; adds: string[]; out: { row: PreviewRow }[] }, text: string): NonNullable<ImportResult> => {
  const rows = c.out.map((o) => o.row);
  const later = rows.slice(PREVIEW_ROWS).filter((r) => r.error || r.notes.length).slice(0, PREVIEW_ROWS);
  const notes = text.includes("�") ? ["Some characters couldn't be read (they show as �). Save the file as CSV UTF-8 and add it again if names look wrong", ...c.columnNotes] : c.columnNotes;
  const sample = sampleRows(kind, text);
  return { kind, headers: c.headers, rows: [...rows.slice(0, PREVIEW_ROWS), ...later], total: rows.length, summary: summarise(rows), adds: c.adds, columnNotes: notes, ...(sample ? { sample } : {}) };
};

const SAVE_FAILED = "Nothing was saved. Something couldn't be saved, or changed while you were importing. Check the file again, then import once more.";
const taken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Checks a file (nothing is saved), or, with `commit`, checks it again and saves the rows that are fine. The check always runs on the server, so what's saved is what was checked. */
export async function previewImport(_: ImportResult, form: FormData): Promise<ImportResult> {
  const me = await requireTab("import-export");
  const asked = String(form.get("kind"));
  const kind = KINDS.find((k) => k === asked) ?? "time";
  const text = String(form.get("text") ?? "");
  if (!text.trim()) return failed(kind, "Choose a CSV file or paste CSV text first.");
  if (Buffer.byteLength(text) > MAX_IMPORT_BYTES) return failed(kind, "That is more than 3.5 MB of text. Split it into smaller files.");
  const commit = form.get("commit") === "1";

  if (kind === "people") {
    const c = await checkPeople(me, text, String(form.get("office") ?? ""));
    if (c.error !== undefined) return failed(kind, c.error);
    const view = shown(kind, c, text);
    if (!commit) return view;
    const drafts = c.out.map((o) => o.data).filter((d): d is PersonDraft => !!d);
    if (!drafts.length) return { ...view, error: "None of the rows can be imported. Fix the problems in the file and check it again." };
    let saved;
    try { saved = await savePeople(drafts, c.newTeams); }
    catch (e) {
      console.error("People import failed", e);
      return { ...view, error: taken(e) ? "Nothing was saved. Someone with one of these emails or employee IDs was added while you were importing. Check the file again." : SAVE_FAILED };
    }
    // The record comes first: whatever happens to the emails below, the change log already says who was added.
    const roles = new Map<string, number>();
    for (const d of drafts) roles.set(roleName(d.role), (roles.get(roleName(d.role)) ?? 0) + 1);
    await db.auditLog.createMany({
      data: [
        { userId: me.id, action: `Imported ${saved.length} people from CSV (${[...roles].map(([r, n]) => `${n} ${r}`).join(", ")})` },
        ...saved.map((l) => ({ userId: me.id, action: `Imported ${l.name} (${l.email}) as ${roleName(l.role)} from CSV`, targetUserId: l.id })),
      ],
    });
    const links = saved.map(({ name, email, link }) => ({ name, email, link }));
    const done = [`${links.length} ${links.length === 1 ? "person" : "people"} added, each with an invite link that works for 7 days.`];
    if (form.get("email") === "1") {
      if (!emailConfigured()) done.push("Email isn't switched on yet, so no invites were emailed. Send people their links yourself.");
      else if (links.length > MAX_EMAILS) done.push(`That's more than ${MAX_EMAILS} people, so no invites were emailed. Send people their links yourself.`);
      else {
        let sent = 0;
        for (let i = 0; i < links.length; i += 2) { // two at a time, a second apart: the email service limits how fast it takes messages
          if (i) await pause(1000);
          const results = await Promise.all(links.slice(i, i + 2).map((l) =>
            sendEmail(l.email, "You're invited to The Time Sink", `Hi ${l.name.split(" ")[0]},\n\n${me.name} invited you to The Time Sink, where you'll log your time.\nSet your password here within 7 days: ${l.link}`)));
          sent += results.filter((r) => r.sent).length;
        }
        done.push(sent === links.length ? `Invite emailed to all ${sent}.` : `${sent} of ${links.length} invites were emailed. Send the others their links yourself.`);
      }
    }
    revalidatePath("/people");
    return { ...view, imported: links.length, links, done };
  }

  if (kind === "projects") {
    const c = await checkProjects(me, text);
    if (c.error !== undefined) return failed(kind, c.error);
    const view = shown(kind, c, text);
    if (!commit) return view;
    const drafts = c.out.map((o) => o.data).filter((d): d is ProjectDraft => !!d);
    if (!drafts.length) return { ...view, error: "None of the rows can be imported. Fix the problems in the file and check it again." };
    let imported: number;
    try { imported = await saveProjects(me, drafts, c.newTags); }
    catch (e) { console.error("Project import failed", e); return { ...view, error: SAVE_FAILED }; }
    await logAction(me.id, `Imported ${imported} projects from CSV${c.newClients.length ? ` (new clients: ${c.newClients.join(", ")})`.slice(0, 400) : ""}${c.newTags.length ? ` (new tags: ${c.newTags.join(", ")})`.slice(0, 300) : ""}`);
    revalidatePath("/", "layout");
    return { ...view, imported, done: [`${imported} project${imported === 1 ? "" : "s"} added.`, ...c.adds] };
  }

  const c = await checkTime(me, text, form.get("create") === "1");
  if (c.error !== undefined) return failed(kind, c.error);
  const view = shown(kind, c, text);
  if (!commit) return view;
  const drafts = c.out.map((o) => o.data).filter((d): d is EntryDraft => !!d);
  if (!drafts.length) return { ...view, error: "None of the rows can be imported. Fix the problems in the file and check it again." };
  let imported: number;
  try { imported = await saveTime(drafts, c.plan); }
  catch (e) { console.error("Time import failed", e); return { ...view, error: SAVE_FAILED }; }
  // One line per person whose time was added, so it shows against them (and who added it) as well as in the summary line.
  const perPerson = new Map<string, { n: number; minutes: number; from: string; to: string }>();
  for (const d of drafts) {
    const p = perPerson.get(d.userId) ?? { n: 0, minutes: 0, from: d.date, to: d.date };
    p.n++; p.minutes += d.minutes;
    if (d.date < p.from) p.from = d.date;
    if (d.date > p.to) p.to = d.date;
    perPerson.set(d.userId, p);
  }
  await db.auditLog.createMany({
    data: [
      { userId: me.id, action: `Imported ${imported} time entries from CSV${c.adds.length ? ` (${c.adds.join("; ")})`.slice(0, 500) : ""}` },
      ...[...perPerson].map(([userId, p]) => ({
        userId: me.id, targetUserId: userId,
        action: `Imported ${p.n} time ${p.n === 1 ? "entry" : "entries"} (${Math.round(p.minutes / 6) / 10} h, ${p.from === p.to ? p.from : `${p.from} to ${p.to}`}) from CSV`,
      })),
    ],
  });
  revalidatePath("/", "layout");
  return { ...view, imported, done: [`${imported} time ${imported === 1 ? "entry" : "entries"} added.`, ...c.adds] };
}
