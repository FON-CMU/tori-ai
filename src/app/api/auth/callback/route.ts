import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeCode } from "@/lib/auth/provider";
import { redirectWithSession } from "@/lib/auth/session";
import { upsertIdentity } from "@/server/services/auth-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = jar.get("tori_oidc_state")?.value;
  const storedNonce = jar.get("tori_oidc_nonce")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_callback", request.url));
  }

  try {
    const profile = await exchangeCode(code, storedNonce ?? "");
    const session = await upsertIdentity(profile);
    const response = await redirectWithSession(new URL("/chat", request.url), session);
    response.cookies.set("tori_oidc_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("tori_oidc_nonce", "", { path: "/", maxAge: 0 });
    return response;
  } catch (reason) {
    console.error("[auth/cmu] callback failed:", reason instanceof Error ? reason.message : reason);
    return NextResponse.redirect(new URL("/login?error=invalid_callback", request.url));
  }
}
