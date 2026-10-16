"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/settings";

export type ArchiveResult = { ok: boolean; error?: string };

/** Admins archive a client (it leaves the client lists and project pickers, its history stays) or bring it back. */
export async function setClientArchived(clientId: string, archived: boolean): Promise<ArchiveResult> {
  const me = await requireUser();
  if (me.role !== "ADMIN") return { ok: false, error: "Only Admins can archive or restore a client." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return { ok: false, error: "That client no longer exists." };
  await db.client.update({ where: { id: clientId }, data: { archivedAt: archived ? new Date() : null } });
  await logAction(me.id, `${archived ? "Archived" : "Restored"} client ${client.name}`);
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Admins delete a client for good, but only once it is archived and has no projects left (projects keep their time). */
export async function deleteClient(clientId: string): Promise<ArchiveResult> {
  const me = await requireUser();
  if (me.role !== "ADMIN") return { ok: false, error: "Only Admins can delete a client." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true, archivedAt: true, _count: { select: { projects: true } } } });
  if (!client) return { ok: false, error: "That client no longer exists." };
  if (!client.archivedAt) return { ok: false, error: "Archive the client first. Then you can delete it." };
  if (client._count.projects) return { ok: false, error: `${client.name} still has ${client._count.projects} project${client._count.projects === 1 ? "" : "s"}. Remove those first. Until then the client stays archived.` };
  await db.client.delete({ where: { id: clientId } });
  await logAction(me.id, `Deleted client ${client.name}`);
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}
