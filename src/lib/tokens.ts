import { randomBytes } from "crypto";
import { db } from "./db";

// How long links stay valid.
export const INVITE_HOURS = 24 * 7; // a new person's invite
export const RESET_HOURS = 72; // a reset link a manager hands over
export const SELF_RESET_HOURS = 1; // a "forgot password" email

/** Gives the person a fresh invite or reset link (any older link stops working) and returns its token. */
export async function issueLinkToken(userId: string, hours: number) {
  const token = randomBytes(24).toString("base64url");
  await db.user.update({ where: { id: userId }, data: { inviteToken: token, inviteExpires: new Date(Date.now() + hours * 3600_000) } });
  return token;
}

/** Where a link is still usable: right token, not expired, account active. */
export const liveTokenWhere = (token: string) => ({ inviteToken: token, inviteExpires: { gt: new Date() }, active: true });
