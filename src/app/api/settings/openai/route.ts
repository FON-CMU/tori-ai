import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { clearAiSettings, getAiSettings, saveAiSettings } from "@/server/services/ai-settings-service";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireAdminSession();
    return NextResponse.json({ data: await getAiSettings(), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireAdminSession();
    return NextResponse.json({ data: await saveAiSettings(userId, await request.json()), requestId });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new ApiError(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง"), requestId);
    }
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireAdminSession();
    await clearAiSettings(userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
