"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { ensureDefaults } from "@/lib/defaults";

export type SetupState = { error: string } | null;

export async function setupAdmin(_: SetupState, form: FormData): Promise<SetupState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const office = String(form.get("office") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!name) return { error: "Add your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!office) return { error: "Name your office." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const passwordHash = await bcrypt.hash(password, 10);

  let userId: string;
  try {
    // Serializable, so two people submitting at the same moment can't both become the first admin.
    userId = await db.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw new Error("ALREADY_SET_UP");
      await ensureDefaults(tx);
      const loc = await tx.location.upsert({ where: { name: office }, update: {}, create: { name: office } });
      const user = await tx.user.create({ data: { name, email, title: "Administrator", role: "ADMIN", weeklyTarget: 0, locationId: loc.id, passwordHash } });
      await tx.auditLog.create({ data: { userId: user.id, action: `Set up Clock me and created the ${office} office` } });
      return user.id;
    }, { isolationLevel: "Serializable", timeout: 20000 });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_SET_UP") redirect("/login");
    return { error: "Setup didn't finish. Please try again." };
  }
  await createSession(userId);
  redirect("/people?welcome=1");
}
