"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { sendEmail, appUrl, emailConfigured } from "@/lib/email";
import { issueLinkToken, liveTokenWhere, SELF_RESET_HOURS } from "@/lib/tokens";
import { clearAttempts, clientIp, releaseAttempts, takeAttempt } from "@/lib/throttle";

export type LoginState = { error: string; email: string } | null;

// Compared against when there's no account, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("no-account-placeholder", 10));

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();
  const attempt = await takeAttempt([[`login:${email}`, 10], [`login-ip:${ip}`, 50]]);
  if (!attempt.allowed) return { error: "Too many sign-in attempts. Wait 15 minutes and try again, or reset your password.", email };
  const user = await db.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !user.passwordHash || !ok) return { error: "That email and password don't match. Check them and try again.", email };
  await clearAttempts(`login:${email}`);
  await releaseAttempts(attempt.ids);
  // They remembered their password, so any reset link they asked for is no longer needed.
  if (user.inviteToken) await db.user.update({ where: { id: user.id }, data: { inviteToken: null, inviteExpires: null } });
  await createSession(user.id, user.sessionVersion);
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
  const user = token ? await db.user.findFirst({ where: liveTokenWhere(token) }) : null;
  if (!user) return "This link has expired or has already been used. Ask your admin for a new one.";
  const passwordHash = await bcrypt.hash(password, 10);
  // Use the link up in one step, so it can't be used twice, and sign out any other devices.
  const used = await db.user.updateMany({
    where: { id: user.id, ...liveTokenWhere(token) },
    data: { passwordHash, inviteToken: null, inviteExpires: null, sessionVersion: { increment: 1 } },
  });
  if (used.count !== 1) return "This link has expired or has already been used. Ask your admin for a new one.";
  await clearAttempts(`login:${user.email}`);
  await createSession(user.id, user.sessionVersion + 1);
  redirect(user.role === "MEMBER" ? "/timesheet" : "/dashboard");
}

const RESET_MESSAGE = "If that email has an account, we've sent it a link to choose a new password. No email after a few minutes? Ask your admin for a reset link.";

export async function requestReset(_: string | null, form: FormData): Promise<string | null> {
  // Without an email service nothing could deliver a link, so don't make one (it would also replace a link the admin handed over).
  if (!emailConfigured()) return "This site doesn't send password reset emails yet. Ask your admin for a reset link.";
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();
  if (!(await takeAttempt([[`reset-ip:${ip}`, 20]])).allowed) return RESET_MESSAGE;
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  // At most one reset email every 10 minutes per person, so nobody can flood an inbox or use up the email quota.
  if (user?.active && (!user.resetSentAt || Date.now() - user.resetSentAt.getTime() > 10 * 60_000)) {
    // Resend a link that still works (such as an invite) instead of replacing it, so asking for a reset never breaks a link already sent.
    const live = user.inviteToken && user.inviteExpires && user.inviteExpires > new Date() ? { token: user.inviteToken, expires: user.inviteExpires } : null;
    const token = live?.token ?? (await issueLinkToken(user.id, SELF_RESET_HOURS));
    const hours = live ? Math.max(1, Math.floor((live.expires.getTime() - Date.now()) / 3600_000)) : SELF_RESET_HOURS;
    await db.user.update({ where: { id: user.id }, data: { resetSentAt: new Date() } });
    const action = user.passwordHash ? "reset your Clock me password" : "set up your Clock me account";
    await sendEmail(user.email, user.passwordHash ? "Reset your Clock me password" : "Set up your Clock me account", `Hi ${user.name.split(" ")[0]},\n\nSomeone asked to ${action}. If it was you, choose a password here within the next ${hours === 1 ? "hour" : `${hours} hours`}: ${appUrl()}/invite/${token}\n\nIf it wasn't you, you can ignore this email.`);
  }
  return RESET_MESSAGE;
}
