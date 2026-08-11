import type { AppRoleCode } from "@/lib/auth/types";

export function splitCsvList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Map Entra app roles / groups / email allowlist → app roles */
export function resolveEntraSuggestedRolesFromClaims(input: {
  email: string;
  roles?: unknown;
  groups?: unknown;
  adminEmails?: string[];
  adminGroups?: string[];
}): AppRoleCode[] {
  const suggested = new Set<AppRoleCode>(["EMPLOYEE"]);
  const claimRoles = Array.isArray(input.roles)
    ? input.roles.map(String)
    : typeof input.roles === "string"
      ? [input.roles]
      : [];
  const claimGroups = Array.isArray(input.groups)
    ? input.groups.map(String)
    : typeof input.groups === "string"
      ? [input.groups]
      : [];

  const adminEmails = new Set((input.adminEmails ?? []).map((email) => email.toLowerCase()));
  const adminGroups = new Set(input.adminGroups ?? []);

  const hasAdminRole = claimRoles.some((role) =>
    /^(admin|tori\.admin|tori-admin)$/i.test(role.trim()),
  );
  const hasAdminGroup = claimGroups.some((group) => adminGroups.has(group));
  const hasAdminEmail = adminEmails.has(input.email.toLowerCase());

  if (hasAdminRole || hasAdminGroup || hasAdminEmail) {
    suggested.add("ADMIN");
  }
  if (claimRoles.some((role) => /^(supervisor|tori\.supervisor|tori-supervisor)$/i.test(role.trim()))) {
    suggested.add("SUPERVISOR");
  }
  if (claimRoles.some((role) => /^(hr|tori\.hr|tori-hr)$/i.test(role.trim()))) {
    suggested.add("HR");
  }

  return [...suggested];
}
