import "server-only";

import type { IdentityProfile } from "@/lib/auth/types";
import { prisma } from "@/lib/prisma";

async function ensureRole(code: "EMPLOYEE" | "ADMIN" | "SUPERVISOR" | "HR") {
  return prisma.role.upsert({
    where: { code },
    update: {},
    create: { code },
  });
}

export async function upsertIdentity(profile: IdentityProfile) {
  const unit = await prisma.unit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000001", name: "หน่วยงานรอการยืนยัน" },
  });

  const existing =
    (profile.entraOid
      ? await prisma.user.findUnique({ where: { entraOid: profile.entraOid } })
      : null)
    ?? (await prisma.user.findUnique({ where: { email: profile.email } }))
    ?? (await prisma.user.findUnique({ where: { cmuAccount: profile.email } }));

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: profile.email,
          firstName: profile.firstName || existing.firstName,
          lastName: profile.lastName || existing.lastName,
          title: profile.title ?? existing.title,
          position: profile.position ?? existing.position,
          entraOid: profile.entraOid ?? existing.entraOid,
        },
      })
    : await prisma.user.create({
        data: {
          cmuAccount: profile.email,
          entraOid: profile.entraOid ?? null,
          employeeId: profile.employeeId,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          title: profile.title,
          position: profile.position,
          unitId: unit.id,
        },
      });

  const desiredRoles = new Set<"EMPLOYEE" | "ADMIN" | "SUPERVISOR" | "HR">(
    profile.suggestedRoles?.length ? profile.suggestedRoles : ["EMPLOYEE"],
  );
  if (!desiredRoles.has("EMPLOYEE")) desiredRoles.add("EMPLOYEE");

  for (const code of desiredRoles) {
    const role = await ensureRole(code);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  // ถ้าไม่ได้อยู่ในรายการ admin จาก IdP แล้ว — ไม่ถอด ADMIN เดิมอัตโนมัติ
  // (กันหลุดสิทธิ์เมื่อ group claim ไม่ถูกส่งในรอบนั้น)
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
