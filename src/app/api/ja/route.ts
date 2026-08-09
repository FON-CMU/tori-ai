import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const { userId } = await requireSession();
  return NextResponse.json({
    data: await prisma.jaRecord.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      orderBy: { startAt: "desc" },
      take: 100,
      include: { torTopic: true },
    }),
  });
}
