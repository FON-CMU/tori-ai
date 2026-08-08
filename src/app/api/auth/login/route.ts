import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAuthorizationUrl } from "@/lib/auth/provider";

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  jar.set("tori_oidc_state", state, options); jar.set("tori_oidc_nonce", nonce, options);
  return NextResponse.redirect(await createAuthorizationUrl(state, nonce) ?? new URL("/login", request.url));
}
