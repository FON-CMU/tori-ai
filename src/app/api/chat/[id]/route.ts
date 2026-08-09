import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { deleteConversation, getConversation } from "@/server/services/chat-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    return NextResponse.json({
      data: await getConversation(userId, (await params).id),
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    return NextResponse.json({
      data: await deleteConversation(userId, (await params).id),
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
