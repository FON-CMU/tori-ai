import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { setChatTorYear } from "@/server/services/chat-service";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const body = await request.json() as { conversationId?: string | null; year?: number };
    if (!body.year || !Number.isInteger(body.year)) {
      throw new ApiError(400, "YEAR_REQUIRED", "กรุณาเลือกปี TOR");
    }
    return NextResponse.json({
      data: await setChatTorYear(userId, body.conversationId ?? null, body.year),
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
