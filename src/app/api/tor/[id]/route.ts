import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { deleteTor, updateTorYear } from "@/server/services/tor-upload-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const body = await request.json() as { year?: unknown };
    const document = await updateTorYear(userId, (await params).id, body.year);
    return NextResponse.json({ data: { id: document.id, year: document.year }, requestId });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new ApiError(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "ปีไม่ถูกต้อง"), requestId);
    }
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    return NextResponse.json({ data: await deleteTor(userId, (await params).id), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
