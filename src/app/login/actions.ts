"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { randomBytes } from "crypto";
import { sendEmail, appUrl } from "@/lib/email";

export type LoginState = { error: string; email: string } | null;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "That email and password don't match. Check them and try again.", email };
  }
  await createSession(user.id);
  redirect(user.role === "MEMBER" ? "/timesheet" : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function acceptInvite(_: string | null, form: FormData): Promise<string | null> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return "Use at least 8 characters.";
  if (password !== String(form.get("confirm") ?? "")) return "The two passwords don't match.";
  const user = await db.user.findUnique({ where: { inviteToken: token } });
  if (!user) return "This invite link has already been used or is no longer valid.";
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10), inviteToken: null } });
  await createSession(user.id);
  redirect("/timesheet");
}

export async function requestReset(_: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  if (user?.active) {
    const token = user.inviteToken ?? randomBytes(24).toString("base64url");
    if (!user.inviteToken) await db.user.update({ where: { id: user.id }, data: { inviteToken: token } });
    await sendEmail(user.email, "Reset your Clock me password", `Hi ${user.name.split(" ")[0]},\n\nSomeone asked to reset your Clock me password. If it was you, choose a new one here: ${appUrl()}/invite/${token}\n\nIf it wasn't you, you can ignore this email.`);
  }
  return "If that email has an account, we've sent it a link to choose a new password. No email after a few minutes? Ask your admin for a reset link.";
}
