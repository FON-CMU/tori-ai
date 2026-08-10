import "server-only";

export type AuthProvider = "cmu" | "entra" | "mock";

export type AppRoleCode = "EMPLOYEE" | "ADMIN" | "SUPERVISOR" | "HR";

export type IdentityProfile = {
  subject: string;
  email: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  title?: string;
  position?: string;
  provider: AuthProvider;
  entraOid?: string;
  /** Roles suggested by IdP claims / allowlists — assigned on upsert */
  suggestedRoles?: AppRoleCode[];
};
