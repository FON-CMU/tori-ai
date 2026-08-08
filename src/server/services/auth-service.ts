import "server-only";

import type { IdentityProfile } from "@/lib/auth/provider";
import { prisma } from "@/lib/prisma";

export async function upsertIdentity(profile: IdentityProfile) {
  const unit = await prisma.unit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000001", name: "หน่วยงานรอการยืนยัน" },
  });
  const employeeRole = await prisma.role.upsert({
    where: { code: "EMPLOYEE" },
    update: {},
    create: { code: "EMPLOYEE" },
  });
  const user = await prisma.user.upsert({
    where: { cmuAccount: profile.email },
    update: {
      email: profile.email,
      employeeId: profile.employeeId,
      firstName: profile.firstName,
      lastName: profile.lastName,
    },
    create: {
      cmuAccount: profile.email,
      employeeId: profile.employeeId,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      title: profile.title,
      position: profile.position,
      unitId: unit.id,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: employeeRole.id } },
    update: {},
    create: { userId: user.id, roleId: employeeRole.id },
  });

  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: { select: { code: true } } },
  });

  return {
    userId: user.id,
    unitId: user.unitId,
    roles: roles.map((entry) => entry.role.code),
  };
}
