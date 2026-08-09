import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { deleteJa } from "@/server/services/ja-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const data = await deleteJa(userId, (await params).id);
    return NextResponse.json({ data, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
