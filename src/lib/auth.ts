import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "ujris_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET is missing or too short. Set a long random AUTH_SECRET environment variable before starting UJRIS in production."
      );
    }
    console.warn(
      "[ujris] AUTH_SECRET is missing/weak. Using an insecure development-only fallback. Set AUTH_SECRET before deploying."
    );
    return new TextEncoder().encode("insecure-dev-fallback-do-not-use-in-production");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  jti: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Issue a JWT bound to a server-side AuthSession row (`jti`).
 * Interim until Supabase Auth. Tokens are not stored in plaintext.
 */
export async function issueSession(payload: Omit<SessionPayload, "jti">): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  await db.authSession.create({
    data: {
      id: jti,
      userId: payload.userId,
      expiresAt,
    },
  });
  const token = await new SignJWT({ userId: payload.userId, email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getAuthSecret());
  return { token, jti };
}

export async function createSessionToken(payload: Omit<SessionPayload, "jti">): Promise<string> {
  const { token } = await issueSession(payload);
  return token;
}

export async function revokeSession(jti: string): Promise<void> {
  await db.authSession.updateMany({
    where: { id: jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (typeof payload.userId !== "string") return null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) return null;

    const session = await db.authSession.findUnique({ where: { id: jti } });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.userId !== payload.userId) return null;

    return {
      userId: payload.userId,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      jti,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: Omit<SessionPayload, "jti">) {
  const { token } = await issueSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { subscription: true },
  });
  return user;
}

/** Logout: revoke the jti then drop the cookie. A captured copy of the JWT then fails verifySessionToken. */
export async function revokeCurrentSessionAndClearCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await verifySessionToken(token);
    if (session) {
      await revokeSession(session.jti);
    } else {
      // Token may already be invalid; still try to extract jti without the active-session check.
      try {
        const { payload } = await jwtVerify(token, getAuthSecret());
        if (typeof payload.jti === "string") await revokeSession(payload.jti);
      } catch {
        // ignore
      }
    }
  }
  await clearSessionCookie();
}
