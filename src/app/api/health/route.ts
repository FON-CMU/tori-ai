import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "connected", requestId, timestamp: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
