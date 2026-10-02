import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { readSession } from "./session";
import { canTab, type Tab } from "./roles";

export const currentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.uid }, include: { team: true, location: true } });
  // A changed password or a deactivation bumps sessionVersion, which ends every older sign-in.
  return user && user.active && user.sessionVersion === session.sv ? user : null;
});

export type Me = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser(): Promise<Me> {
  const u = await currentUser();
  if (!u) redirect("/login");
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
