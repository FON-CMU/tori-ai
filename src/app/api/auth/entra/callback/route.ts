import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeEntraCode } from "@/lib/auth/entra";
import { redirectWithSession } from "@/lib/auth/session";
import { upsertIdentity } from "@/server/services/auth-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const storedState = jar.get("tori_entra_state")?.value;
  const storedNonce = jar.get("tori_entra_nonce")?.value;

  if (oauthError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(oauthError)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=invalid_callback", request.url));
  }

  if (!storedState || state !== storedState) {
    console.error("[auth/entra] state mismatch", {
      hasStoredState: Boolean(storedState),
      stateMatches: storedState === state,
    });
    return NextResponse.redirect(new URL("/login?error=invalid_callback", request.url));
  }

  try {
    const profile = await exchangeEntraCode(code, storedNonce ?? "");
    const session = await upsertIdentity(profile);
    const response = await redirectWithSession(new URL("/chat", request.url), session);
    response.cookies.set("tori_entra_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("tori_entra_nonce", "", { path: "/", maxAge: 0 });
    return response;
  } catch (reason) {
    console.error("[auth/entra] callback failed:", reason instanceof Error ? reason.message : reason);
    return NextResponse.redirect(new URL("/login?error=entra_callback_failed", request.url));
  }
}
