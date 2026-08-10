import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeEntraCode } from "@/lib/auth/entra";
import { redirectWithSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { upsertIdentity } from "@/server/services/auth-service";

function appOrigin() {
  return new URL(env.APP_URL).origin;
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  const parts = header.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const storedState = jar.get("tori_entra_state")?.value ?? readCookie(request, "tori_entra_state");
  const storedNonce = jar.get("tori_entra_nonce")?.value ?? readCookie(request, "tori_entra_nonce");
  const origin = appOrigin();

  if (oauthError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(oauthError)}`, origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=invalid_callback", origin));
  }

  if (!storedState || state !== storedState) {
    console.error("[auth/entra] state mismatch", {
      hasStoredState: Boolean(storedState),
      stateMatches: storedState === state,
      host: url.host,
      appHost: new URL(origin).host,
    });
    return NextResponse.redirect(new URL("/login?error=invalid_callback", origin));
  }

  try {
    const profile = await exchangeEntraCode(code, storedNonce ?? "");
    const session = await upsertIdentity(profile);
    const response = await redirectWithSession(new URL("/chat", origin), session);
    response.cookies.set("tori_entra_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("tori_entra_nonce", "", { path: "/", maxAge: 0 });
    return response;
  } catch (reason) {
    console.error("[auth/entra] callback failed:", reason instanceof Error ? reason.message : reason);
    return NextResponse.redirect(new URL("/login?error=entra_callback_failed", origin));
  }
}
