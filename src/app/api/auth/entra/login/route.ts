import { NextResponse } from "next/server";

import { createEntraAuthorizationUrl, isEntraConfigured } from "@/lib/auth/entra";

const oidcCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(request: Request) {
  if (!isEntraConfigured()) {
    return NextResponse.redirect(new URL("/login?error=entra_not_configured", request.url));
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  try {
    const response = NextResponse.redirect(await createEntraAuthorizationUrl(state, nonce));
    response.cookies.set("tori_entra_state", state, oidcCookieOptions);
    response.cookies.set("tori_entra_nonce", nonce, oidcCookieOptions);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=entra_start_failed", request.url));
  }
}
