import { NextResponse } from "next/server";

import { createEntraAuthorizationUrl, isEntraConfigured } from "@/lib/auth/entra";
import { env } from "@/lib/env";

const oidcCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

function appOrigin() {
  return new URL(env.APP_URL).origin;
}

export async function GET(request: Request) {
  if (!isEntraConfigured()) {
    return NextResponse.redirect(new URL("/login?error=entra_not_configured", appOrigin()));
  }

  // บังคับเริ่ม OIDC บนโดเมนเดียวกับ ENTRA_REDIRECT_URI / APP_URL
  // กัน cookie state หายเมื่อกดล็อกอินจาก URL deploy ชั่วคราว (*.vercel.app อื่น)
  const requestOrigin = new URL(request.url).origin;
  if (requestOrigin !== appOrigin()) {
    return NextResponse.redirect(new URL("/api/auth/entra/login", appOrigin()));
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  try {
    const response = NextResponse.redirect(await createEntraAuthorizationUrl(state, nonce));
    response.cookies.set("tori_entra_state", state, oidcCookieOptions);
    response.cookies.set("tori_entra_nonce", nonce, oidcCookieOptions);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=entra_start_failed", appOrigin()));
  }
}
