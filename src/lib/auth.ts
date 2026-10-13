import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { hasSessionCookie, readSession } from "./session";
import { canTab, type Tab } from "./roles";

export const currentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.uid }, include: { team: true, location: true } });
  // Signing out, a changed password or a deactivation bumps sessionVersion, which ends every older sign-in.
  return user && user.active && user.sessionVersion === session.sv ? user : null;
});

export type Me = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/**
 * The sign-in page for someone who isn't signed in. A cookie that no longer works, or a page action sent without one
 * (they signed out in another tab), means their session has ended, so the page says so.
 */
export async function signInPath() {
  const ended = (await hasSessionCookie()) || (await headers()).has("next-action");
  return ended ? "/login?reason=ended" : "/login";
}

export async function requireUser(): Promise<Me> {
  const u = await currentUser();
  if (!u) redirect(await signInPath());
  return u;
}

export async function requireTab(tab: Tab): Promise<Me> {
  const u = await requireUser();
  if (!canTab(tab, u.role)) redirect("/timesheet");
  return u;
}

export function requireRole(me: Me, roles: Role[]) {
  if (!roles.includes(me.role)) throw new Error("You don't have permission to do that.");
}
