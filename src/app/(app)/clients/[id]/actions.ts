"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { newShareToken } from "@/lib/clientShare";

export type ShareOp = "on" | "off" | "renew" | "approvedOnly" | "allTime";
export type ShareResult = { ok: boolean; error?: string };

/** Admins manage a client's view-only report link: create it, turn it off, make a new one (the old one stops working), and choose whether it counts only approved time. */
export async function changeShareLink(clientId: string, op: ShareOp): Promise<ShareResult> {
  const me = await requireUser();
  if (me.role !== "ADMIN") return { ok: false, error: "Only admins can change a client's link." };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true, shareToken: true } });
  if (!client) return { ok: false, error: "That client no longer exists." };
  if (op === "on") {
    if (!client.shareToken) await db.client.update({ where: { id: clientId }, data: { shareToken: newShareToken(), shareViewedAt: null } });
    await logAction(me.id, `Turned on the view-only link for client ${client.name}`);
  } else if (op === "renew") {
    if (!client.shareToken) return { ok: false, error: "Turn the link on first." };
    await db.client.update({ where: { id: clientId }, data: { shareToken: newShareToken(), shareViewedAt: null } });
    await logAction(me.id, `Made a new view-only link for client ${client.name}; the old link stopped working`);
  } else if (op === "off") {
    await db.client.update({ where: { id: clientId }, data: { shareToken: null } });
    await logAction(me.id, `Turned off the view-only link for client ${client.name}`);
  } else {
    await db.client.update({ where: { id: clientId }, data: { shareApprovedOnly: op === "approvedOnly" } });
    await logAction(me.id, `Client ${client.name}'s view-only link ${op === "approvedOnly" ? "now counts approved time only" : "now counts all logged time"}`);
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
