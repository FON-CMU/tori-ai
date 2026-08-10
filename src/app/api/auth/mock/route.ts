import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { setSessionCookie } from "@/lib/auth/session";
import { upsertIdentity } from "@/server/services/auth-service";

const notFound = () =>
  NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });

function passwordMatches(supplied: string, expected: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Signs in as the seeded demo account, which holds ADMIN. Outside development
 * it stays disabled unless ALLOW_MOCK_LOGIN and MOCK_LOGIN_PASSWORD are both
 * set — a deliberate, temporary stand-in until CMU OIDC is configured.
 */
export async function POST(request: Request) {
  const isDevelopment = env.NODE_ENV === "development";
  const gatedByPassword = env.ALLOW_MOCK_LOGIN && Boolean(env.MOCK_LOGIN_PASSWORD);
  if (!isDevelopment && !gatedByPassword) return notFound();

  if (!isDevelopment) {
    // Same 404 as the disabled case for every failure, including a malformed
    // or missing body: never confirm the endpoint is there.
    const form = await request.formData().catch(() => null);
    const supplied = form?.get("password");
    if (typeof supplied !== "string" || !passwordMatches(supplied, env.MOCK_LOGIN_PASSWORD!)) {
      return notFound();
    }
    console.warn(JSON.stringify({ level: "warn", event: "mock_login_used", message: "Demo sign-in used outside development" }));
  }

  // suggestedRoles is what keeps ADMIN on this account — upsertIdentity now
  // grants EMPLOYEE only when the caller does not ask for more.
  await setSessionCookie(
    await upsertIdentity({
      provider: "mock",
      subject: "dev",
      email: "demo.user@cmu.ac.th",
      employeeId: "DEV-0001",
      firstName: "ผู้ใช้",
      lastName: "สาธิต",
      position: "บุคลากร",
      suggestedRoles: ["EMPLOYEE", "ADMIN"],
    }),
  );
  // request.url, not APP_URL — the latter throws you off a preview deployment
  // back onto production.
  return NextResponse.redirect(new URL("/chat", request.url), 303);
}
