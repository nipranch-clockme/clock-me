"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { ensureDefaults } from "@/lib/defaults";
import { matchesDatabasePassword } from "@/lib/ownerCheck";
import { isTimeZone } from "@/lib/dates";
import { clientIp, releaseAttempts, takeAttempt } from "@/lib/throttle";

export type SetupState = { error: string } | null;

export async function setupAdmin(_: SetupState, form: FormData): Promise<SetupState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const office = String(form.get("office") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();
  const attempt = await takeAttempt([[`setup-ip:${ip}`, 10]]);
  if (!attempt.allowed) return { error: "Too many attempts. Wait 15 minutes and try again." };
  if (!matchesDatabasePassword(String(form.get("proof") ?? ""))) {
    return { error: "That isn't this site's database connection string. Copy it from Neon (Connect) or from Vercel (Settings > Environment Variables)." };
  }
  await releaseAttempts(attempt.ids);
  const tzIn = String(form.get("timeZone") ?? "");
  const timeZone = isTimeZone(tzIn) ? tzIn : "UTC";
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
      await tx.settings.update({ where: { id: 1 }, data: { timeZone } });
      const loc = await tx.location.upsert({ where: { name: office }, update: {}, create: { name: office } });
      const user = await tx.user.create({ data: { name, email, title: "Administrator", role: "ADMIN", weeklyTarget: 0, locationId: loc.id, passwordHash } });
      await tx.auditLog.create({ data: { userId: user.id, action: `Set up The Time Sink and created the ${office} office`, targetUserId: user.id } });
      return user.id;
    }, { isolationLevel: "Serializable", timeout: 20000 });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_SET_UP") redirect("/login");
    return { error: "Setup didn't finish. Please try again." };
  }
  await createSession(userId);
  redirect("/people?welcome=1");
}
