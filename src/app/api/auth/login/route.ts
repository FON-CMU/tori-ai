import { NextResponse } from "next/server";

import { createAuthorizationUrl, isCmuConfigured } from "@/lib/auth/provider";

const oidcCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(request: Request) {
  if (!isCmuConfigured()) {
    return NextResponse.redirect(new URL("/login?error=cmu_not_configured", request.url));
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  try {
    const response = NextResponse.redirect(await createAuthorizationUrl(state, nonce));
    response.cookies.set("tori_oidc_state", state, oidcCookieOptions);
    response.cookies.set("tori_oidc_nonce", nonce, oidcCookieOptions);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=cmu_start_failed", request.url));
  }
}
