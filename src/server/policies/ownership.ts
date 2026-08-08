export type Actor = { userId: string; unitId: string; roles: string[] };
type OwnedResource = { userId: string };

const privileged = (actor: Actor) => actor.roles.includes("ADMIN");
export const canReadTor = (actor: Actor, tor: OwnedResource) => privileged(actor) || actor.userId === tor.userId;
export const canUpdateTor = canReadTor;
export const canReadJa = (actor: Actor, ja: OwnedResource) => privileged(actor) || actor.userId === ja.userId;
export const canUpdateJa = canReadJa;
export const canViewDashboard = (actor: Actor, scope: { userId?: string; unitId?: string }) => privileged(actor) || scope.userId === actor.userId || (actor.roles.includes("SUPERVISOR") && scope.unitId === actor.unitId);
