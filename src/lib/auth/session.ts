import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { ApiError } from "@/lib/http/api-error";

export const SESSION_COOKIE = "tori_session";
const MAX_AGE = 60 * 60 * 8;

export type Session = { userId: string; unitId: string; roles: string[] };

function secret() {
  if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export async function createSessionToken(session: Session) {
  return new SignJWT(session).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}

export async function setSessionCookie(session: Session) {
  const token = await createSessionToken(session);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function readSessionToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: String(payload.userId), unitId: String(payload.unitId), roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [] };
  } catch { return null; }
}

export async function getSession() {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new ApiError(401, "UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ");
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  if (!session.roles.includes("ADMIN")) {
    throw new ApiError(403, "FORBIDDEN", "เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่า AI ได้");
  }
  return session;
}

export async function requirePageSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdminPageSession() {
  const session = await requirePageSession();
  if (!session.roles.includes("ADMIN")) redirect("/chat");
  return session;
}
