import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "@/lib/env";
import { resolveEntraSuggestedRolesFromClaims, splitCsvList } from "@/lib/auth/entra-roles";
import type { AppRoleCode, IdentityProfile } from "@/lib/auth/types";

export { resolveEntraSuggestedRolesFromClaims } from "@/lib/auth/entra-roles";
export type { AppRoleCode, IdentityProfile } from "@/lib/auth/types";

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

export function isEntraConfigured() {
  return Boolean(
    env.ENTRA_TENANT_ID
    && env.ENTRA_CLIENT_ID
    && env.ENTRA_CLIENT_SECRET
    && env.ENTRA_REDIRECT_URI,
  );
}

export function entraIssuer() {
  if (!env.ENTRA_TENANT_ID) throw new Error("ENTRA_TENANT_ID is not configured");
  return `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0`;
}

async function discovery(): Promise<Discovery> {
  const issuer = entraIssuer();
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load Microsoft Entra OIDC discovery document");
  return response.json() as Promise<Discovery>;
}

export function resolveEntraSuggestedRoles(input: {
  email: string;
  roles?: unknown;
  groups?: unknown;
}): AppRoleCode[] {
  return resolveEntraSuggestedRolesFromClaims({
    ...input,
    adminEmails: splitCsvList(env.ENTRA_ADMIN_EMAILS),
    adminGroups: splitCsvList(env.ENTRA_ADMIN_GROUP_IDS),
  });
}

export async function createEntraAuthorizationUrl(state: string, nonce: string) {
  if (!isEntraConfigured()) throw new Error("Microsoft Entra is not configured");
  const config = await discovery();
  const url = new URL(config.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID!,
    redirect_uri: env.ENTRA_REDIRECT_URI!,
    response_type: "code",
    response_mode: "query",
    scope: "openid profile email",
    state,
    nonce,
  }).toString();
  return url;
}

export async function exchangeEntraCode(code: string, nonce: string): Promise<IdentityProfile> {
  if (!isEntraConfigured()) throw new Error("Microsoft Entra is not configured");
  const config = await discovery();
  const response = await fetch(config.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.ENTRA_CLIENT_ID!,
      client_secret: env.ENTRA_CLIENT_SECRET!,
      redirect_uri: env.ENTRA_REDIRECT_URI!,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Microsoft Entra token exchange failed${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Microsoft Entra did not return an ID token");

  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(config.jwks_uri)),
    {
      issuer: config.issuer,
      audience: env.ENTRA_CLIENT_ID,
    },
  );

  if (payload.nonce !== nonce) throw new Error("Microsoft Entra nonce mismatch");

  const emailRaw =
    (typeof payload.email === "string" && payload.email)
    || (typeof payload.preferred_username === "string" && payload.preferred_username)
    || (typeof payload.upn === "string" && payload.upn)
    || null;
  if (!emailRaw) throw new Error("Microsoft Entra profile is missing email");

  const email = emailRaw.toLowerCase();
  const oid = typeof payload.oid === "string" && payload.oid
    ? payload.oid
    : String(payload.sub ?? "");
  if (!oid) throw new Error("Microsoft Entra profile is missing oid/sub");

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const given = typeof payload.given_name === "string" ? payload.given_name.trim() : "";
  const family = typeof payload.family_name === "string" ? payload.family_name.trim() : "";
  let firstName = given;
  let lastName = family;
  if (!firstName && name) {
    const parts = name.split(/\s+/);
    firstName = parts[0] ?? name;
    lastName = parts.slice(1).join(" ") || "-";
  }
  if (!firstName) firstName = email.split("@")[0] || "User";
  if (!lastName) lastName = "-";

  return {
    provider: "entra",
    subject: String(payload.sub ?? oid),
    entraOid: oid,
    email,
    employeeId: `ENTRA-${oid}`,
    firstName,
    lastName,
    suggestedRoles: resolveEntraSuggestedRoles({
      email,
      roles: payload.roles,
      groups: payload.groups,
    }),
  };
}
