import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { redirectWithSession } from "@/lib/auth/session";
import { upsertIdentity } from "@/server/services/auth-service";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!env.DEMO_LOGIN_ENABLED || !env.DEMO_LOGIN_EMAIL || !env.DEMO_LOGIN_PASSWORD) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  const emailOk = safeEqual(email, env.DEMO_LOGIN_EMAIL.trim().toLowerCase());
  const passwordOk = safeEqual(password, env.DEMO_LOGIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    return NextResponse.redirect(new URL("/login?error=demo_invalid", env.APP_URL), 303);
  }

  const session = await upsertIdentity({
    provider: "mock",
    subject: `demo:${env.DEMO_LOGIN_EMAIL}`,
    email: env.DEMO_LOGIN_EMAIL,
    employeeId: "DEMO-0001",
    firstName: "ผู้ใช้",
    lastName: "สาธิต",
    position: "บุคลากร",
    suggestedRoles: ["EMPLOYEE", "ADMIN"],
  });

  return redirectWithSession(new URL("/chat", env.APP_URL), session);
}
