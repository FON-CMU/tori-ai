import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RoleCode } from "../src/generated/prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to seed the database");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const unit = await prisma.unit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000001", name: "หน่วยงานสาธิต" },
  });

  const [employeeRole, adminRole] = await Promise.all([
    prisma.role.upsert({ where: { code: RoleCode.EMPLOYEE }, update: {}, create: { code: RoleCode.EMPLOYEE } }),
    prisma.role.upsert({ where: { code: RoleCode.ADMIN }, update: {}, create: { code: RoleCode.ADMIN } }),
  ]);

  const user = await prisma.user.upsert({
    where: { cmuAccount: "demo.user@cmu.ac.th" },
    update: { unitId: unit.id },
    create: {
      cmuAccount: "demo.user@cmu.ac.th",
      employeeId: "DEV-0001",
      firstName: "ผู้ใช้",
      lastName: "สาธิต",
      email: "demo.user@cmu.ac.th",
      position: "บุคลากร",
      unitId: unit.id,
    },
  });

  await Promise.all([
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: employeeRole.id } },
      update: {},
      create: { userId: user.id, roleId: employeeRole.id },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      update: {},
      create: { userId: user.id, roleId: adminRole.id },
    }),
  ]);

  await prisma.systemAiConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  console.info(`Seeded development user: ${user.cmuAccount} (EMPLOYEE + ADMIN)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
