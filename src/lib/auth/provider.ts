import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "@/lib/env";
import type { IdentityProfile } from "@/lib/auth/types";

export type { IdentityProfile } from "@/lib/auth/types";

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

export function isCmuConfigured() {
  return Boolean(env.CMU_CLIENT_ID && env.CMU_CLIENT_SECRET && env.CMU_ISSUER && env.CMU_REDIRECT_URI);
}

async function discovery(): Promise<Discovery> {
  if (!env.CMU_ISSUER) throw new Error("CMU_ISSUER is not configured");
  const response = await fetch(`${env.CMU_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load CMU OIDC discovery document");
  return response.json() as Promise<Discovery>;
}

export async function createAuthorizationUrl(state: string, nonce: string) {
  if (!isCmuConfigured()) throw new Error("CMU OIDC is not configured");
  const config = await discovery();
  const url = new URL(config.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: env.CMU_CLIENT_ID!,
    redirect_uri: env.CMU_REDIRECT_URI!,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce,
  }).toString();
  return url;
}

export async function exchangeCode(code: string, nonce: string): Promise<IdentityProfile> {
  if (!isCmuConfigured()) throw new Error("CMU OIDC is not configured");
  const config = await discovery();
  const response = await fetch(config.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.CMU_CLIENT_ID!,
      client_secret: env.CMU_CLIENT_SECRET!,
      redirect_uri: env.CMU_REDIRECT_URI!,
    }),
  });
  if (!response.ok) throw new Error("CMU OIDC token exchange failed");
  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("CMU OIDC did not return an ID token");
  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(config.jwks_uri)),
    { issuer: config.issuer, audience: env.CMU_CLIENT_ID },
  );
  if (payload.nonce !== nonce) throw new Error("CMU OIDC nonce mismatch");
  if (!payload.sub || !payload.email) throw new Error("CMU profile is missing required claims");
  return {
    provider: "cmu",
    subject: payload.sub,
    email: String(payload.email).toLowerCase(),
    employeeId: String(payload.employee_id ?? payload.sub),
    firstName: String(payload.given_name ?? ""),
    lastName: String(payload.family_name ?? ""),
    suggestedRoles: ["EMPLOYEE"],
  };
}
