import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { reviewJa } from "@/server/services/ja-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const session = await requireSession();
    const data = await reviewJa(session, (await params).id, await request.json());
    return NextResponse.json({ data, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
