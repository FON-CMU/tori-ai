import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireDatabaseEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: requireDatabaseEnv(),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error", "warn"],
  });

// Cached in every environment, not only development. Next bundles each route
// handler separately and a serverless instance serves many requests, so
// skipping this in production means one pg Pool per bundle per instance.
globalForPrisma.prisma = prisma;
