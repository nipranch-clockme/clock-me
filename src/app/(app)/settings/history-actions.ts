"use server";
import { revalidatePath } from "next/cache";
import { requireTab } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { addHistoryEntries, finishHistory, historyStatus, removeHistory, startHistory, type HistorySetup, type HistoryStatus } from "@/lib/historyImport";
import type { HistoryEntry } from "@/lib/historyParse";

export type HistoryResult = { ok: boolean; error?: string; message?: string; status: HistoryStatus };

/** Only an admin gets this far: the Settings tab is theirs alone. */
async function admin() {
  const me = await requireTab("settings");
  if (me.role !== "ADMIN") throw new Error("Only an Admin can do this.");
  return me;
}
const fail = async (error: string): Promise<HistoryResult> => ({ ok: false, error, status: await historyStatus() });

export async function startHistoryImport(setup: HistorySetup): Promise<HistoryResult> {
  const me = await admin();
  try {
    const r = await startHistory(setup);
    if (!r.ok) return fail(r.error);
    const status = await historyStatus();
    await logAction(me.id, `Started importing history (${setup.from} to ${setup.to}): ${status.newPeople} new people, ${status.newClients} new clients and ${status.newProjects} new projects`);
    return { ok: true, status };
  } catch (e) {
    console.error("History import start failed", e);
    return fail("Something went wrong, so nothing was added. Try again.");
  }
}

export async function addHistoryChunk(fileKey: string, chunk: number, total: number, rows: HistoryEntry[]): Promise<HistoryResult> {
  await admin();
  try {
    if (!Array.isArray(rows) || rows.length > 5000) return fail("That step was too big.");
    const r = await addHistoryEntries(fileKey, chunk, total, rows);
    return r.ok ? { ok: true, status: await historyStatus() } : fail(r.error);
  } catch (e) {
    console.error("History import step failed", e);
    return fail("Something went wrong while adding time. Choose the file again to continue where it stopped.");
  }
}

export async function finishHistoryImport(fileKey: string): Promise<HistoryResult> {
  const me = await admin();
  try {
    const r = await finishHistory(fileKey);
    if (!r.ok) return fail(r.error);
    const status = await historyStatus();
    await logAction(me.id, `Imported history: ${status.entries} time entries from ${status.from} to ${status.to}, ${r.sheets} weeks marked Approved`);
    revalidatePath("/", "layout");
    return { ok: true, status };
  } catch (e) {
    console.error("History import finish failed", e);
    return fail("Something went wrong while approving the weeks. Choose the file again to finish.");
  }
}

export async function removeHistoryImport(): Promise<HistoryResult> {
  const me = await admin();
  try {
    const r = await removeHistory();
    await logAction(me.id, `Removed imported history: ${r.people} people, ${r.projects} projects and ${r.entries} time entries`);
    revalidatePath("/", "layout");
    return { ok: true, message: `Removed ${r.people} people, ${r.projects} projects and ${r.entries.toLocaleString("en-US")} time entries.`, status: await historyStatus() };
  } catch (e) {
    console.error("History removal failed", e);
    return fail("Something went wrong while removing. Press Remove imported history again.");
  }
}
