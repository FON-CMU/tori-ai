import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { sendChatMessage } from "@/server/services/chat-service";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const body = await request.json() as {
      conversationId?: string | null;
      message?: string;
    };
    return NextResponse.json({
      data: await sendChatMessage(userId, {
        conversationId: body.conversationId,
        message: body.message ?? "",
      }),
      requestId,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new ApiError(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง"), requestId);
    }
    return errorResponse(error, requestId);
  }
}
