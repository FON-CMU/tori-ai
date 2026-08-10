import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { processTor } from "@/server/services/tor-processing-service";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const document = await processTor(userId, (await params).id);
    return NextResponse.json({
      data: {
        id: document.id,
        status: document.status,
        pageCount: document.pages.length,
      },
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
