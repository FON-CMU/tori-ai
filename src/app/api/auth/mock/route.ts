import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { setSessionCookie } from "@/lib/auth/session";
import { upsertIdentity } from "@/server/services/auth-service";

export async function POST() {
  if (env.NODE_ENV !== "development") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  await setSessionCookie(await upsertIdentity({ subject: "dev", email: "demo.user@cmu.ac.th", employeeId: "DEV-0001", firstName: "ผู้ใช้", lastName: "สาธิต", position: "บุคลากร" }));
  return NextResponse.redirect(new URL("/chat", env.APP_URL), 303);
}
