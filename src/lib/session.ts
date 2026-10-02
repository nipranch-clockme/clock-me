import { randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "clockme_session";
let cachedKey: Uint8Array | null = null;

/**
 * The key that signs login cookies. SESSION_SECRET wins when it's set; otherwise the app makes a random key
 * on first use and keeps it in the database, so a new install needs no secret in its settings.
 */
async function secret() {
  if (cachedKey) return cachedKey;
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 32) return (cachedKey = new TextEncoder().encode(env));
  // createMany with skipDuplicates means two first requests at once still agree on one key.
  await db.appSecret.createMany({ data: [{ key: "session", value: randomBytes(48).toString("base64url") }], skipDuplicates: true });
  const row = await db.appSecret.findUniqueOrThrow({ where: { key: "session" } });
  return (cachedKey = new TextEncoder().encode(row.value));
}

/** Signs the person in on this browser. `version` is their sessionVersion; bumping it signs them out everywhere. */
export async function createSession(userId: string, version = 0) {
  const token = await new SignJWT({ uid: userId, sv: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(await secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function readSession(): Promise<{ uid: string; sv: number } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    return typeof payload.uid === "string" ? { uid: payload.uid, sv: typeof payload.sv === "number" ? payload.sv : 0 } : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
