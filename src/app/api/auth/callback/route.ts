import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/auth/provider";
import { setSessionCookie } from "@/lib/auth/session";
import { upsertIdentity } from "@/server/services/auth-service";

export async function GET(request: Request) {
  const url = new URL(request.url); const jar = await cookies();
  const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  if (!code || !state || state !== jar.get("tori_oidc_state")?.value) return NextResponse.redirect(new URL("/login?error=invalid_callback", request.url));
  const profile = await exchangeCode(code, jar.get("tori_oidc_nonce")?.value ?? "");
  await setSessionCookie(await upsertIdentity(profile));
  jar.delete("tori_oidc_state"); jar.delete("tori_oidc_nonce");
  return NextResponse.redirect(new URL("/chat", request.url));
}
