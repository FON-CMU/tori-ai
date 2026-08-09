import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { confirmChatDraft } from "@/server/services/chat-service";

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const body = await request.json() as { conversationId?: string };
    if (!body.conversationId) {
      throw new ApiError(400, "CONVERSATION_REQUIRED", "กรุณาระบุการสนทนา");
    }
    return NextResponse.json({
      data: await confirmChatDraft(userId, body.conversationId),
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
