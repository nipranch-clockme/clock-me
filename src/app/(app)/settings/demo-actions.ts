"use server";
import { revalidatePath } from "next/cache";
import { requireTab } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { addDemoTime, demoStatus, removeDemo, startDemo, type DemoStatus } from "@/lib/demoData";

export type DemoResult = { ok: boolean; error?: string; message?: string; status: DemoStatus } | null;

/** Only an admin gets this far: the Settings tab is theirs alone. */
async function admin() {
  const me = await requireTab("settings");
  if (me.role !== "ADMIN") throw new Error("Only an admin can do this.");
  return me;
}
const fail = async (error: string): Promise<NonNullable<DemoResult>> => ({ ok: false, error, status: await demoStatus() });

/** Adds the people and projects. The time is added afterwards, a few people at a time. */
export async function startDemoData(): Promise<NonNullable<DemoResult>> {
  const me = await admin();
  try {
    const r = await startDemo();
    if (!r.ok) return fail(r.error);
    await logAction(me.id, `Started adding demo data: ${r.people} people and ${r.projects} projects`);
    revalidatePath("/", "layout");
    return { ok: true, status: await demoStatus() };
  } catch (e) {
    console.error("Demo data start failed", e);
    return fail("Something went wrong, so the demo data wasn't added. Use Remove demo data to clear anything half added, then try again.");
  }
}

/** One step of adding time. The page keeps asking until it says it is finished. */
export async function continueDemoData(): Promise<NonNullable<DemoResult> & { finished?: boolean }> {
  const me = await admin();
  try {
    const r = await addDemoTime();
    if (!r.ok) return fail(r.error);
    const status = await demoStatus();
    if (r.finished) {
      await logAction(me.id, `Added demo data: ${status.people} people, ${status.projects} projects and ${status.entries} time entries`);
      revalidatePath("/", "layout");
    }
    return { ok: true, status, finished: r.finished };
  } catch (e) {
    console.error("Demo data step failed", e);
    return fail("Something went wrong while adding time. You can press Continue, or remove the demo data and start again.");
  }
}

export async function removeDemoData(): Promise<NonNullable<DemoResult>> {
  const me = await admin();
  try {
    const r = await removeDemo();
    await logAction(me.id, `Removed demo data: ${r.people} people, ${r.projects} projects and ${r.entries} time entries`);
    revalidatePath("/", "layout");
    return { ok: true, message: `Removed ${r.people} people, ${r.projects} projects and ${r.entries.toLocaleString("en-US")} time entries.`, status: await demoStatus() };
  } catch (e) {
    console.error("Demo data removal failed", e);
    return fail("Something went wrong while removing the demo data. Press Remove demo data again.");
  }
}
