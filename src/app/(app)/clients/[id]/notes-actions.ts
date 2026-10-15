"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { logAction } from "@/lib/settings";

export type NoteResult = { ok: boolean; error?: string };

/** Admins and Location Managers (everyone who can open the Clients tab) can add a note to a client's page. */
export async function addClientNote(clientId: string, _prev: NoteResult | null, form: FormData): Promise<NoteResult> {
  const me = await requireTab("clients");
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write something before adding the note." };
  if (body.length > 2000) return { ok: false, error: "Notes can be up to 2,000 characters. Shorten it and try again." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return { ok: false, error: "That client no longer exists." };
  await db.clientNote.create({ data: { clientId, authorId: me.id, body } });
  await logAction(me.id, `Added a note on client ${client.name}`);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** The person who wrote a note can delete it, and so can any Admin. */
export async function deleteClientNote(noteId: string): Promise<NoteResult> {
  const me = await requireTab("clients");
  const note = await db.clientNote.findUnique({ where: { id: noteId }, select: { clientId: true, authorId: true, client: { select: { name: true } } } });
  if (!note) return { ok: false, error: "That note was already deleted." };
  if (me.role !== "ADMIN" && note.authorId !== me.id) return { ok: false, error: "Only the person who wrote a note, or an Admin, can delete it." };
  await db.clientNote.delete({ where: { id: noteId } });
  await logAction(me.id, `Deleted a note on client ${note.client.name}`);
  revalidatePath(`/clients/${note.clientId}`);
  return { ok: true };
}
