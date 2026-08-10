import "server-only";

import { requirePageSession, type Session } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type CurrentUserProfile = {
  id: string;
  email: string;
  title: string | null;
  firstName: string;
  lastName: string;
  position: string | null;
  employeeId: string;
  unitName: string;
  roles: string[];
  displayName: string;
  isAdmin: boolean;
};

export function formatUserDisplayName(user: {
  title: string | null;
  firstName: string;
  lastName: string;
}) {
  return [user.title, user.firstName, user.lastName].filter(Boolean).join("").trim()
    || [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || "ผู้ใช้";
}

export async function getCurrentUserProfile(session?: Session): Promise<CurrentUserProfile> {
  const active = session ?? await requirePageSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: active.userId },
    select: {
      id: true,
      email: true,
      title: true,
      firstName: true,
      lastName: true,
      position: true,
      employeeId: true,
      unit: { select: { name: true } },
    },
  });

  return {
    id: user.id,
    email: user.email,
    title: user.title,
    firstName: user.firstName,
    lastName: user.lastName,
    position: user.position,
    employeeId: user.employeeId,
    unitName: user.unit.name,
    roles: active.roles,
    displayName: formatUserDisplayName(user),
    isAdmin: active.roles.includes("ADMIN"),
  };
}
