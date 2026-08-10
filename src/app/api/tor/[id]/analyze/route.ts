import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { analyzeTor } from "@/server/services/tor-processing-service";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const document = await analyzeTor(userId, (await params).id, { activate: true });
    return NextResponse.json({
      data: {
        id: document.id,
        status: document.status,
        topicCount: document.topics.length,
      },
      requestId,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
