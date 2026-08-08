import OpenAI from "openai";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { testAiConnection } from "@/server/services/ai-settings-service";

function connectionError(error: unknown) {
  if (!(error instanceof OpenAI.APIError)) return error;
  if (error.status === 401 || error.status === 403) {
    return new ApiError(400, "AI_AUTH_FAILED", "API key ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน");
  }
  if (error.status === 404) {
    return new ApiError(400, "AI_MODEL_NOT_FOUND", "ไม่พบโมเดลนี้ หรือบัญชีไม่มีสิทธิ์ใช้งานโมเดล");
  }
  if (error.status === 429) {
    return new ApiError(400, "AI_QUOTA_EXCEEDED", "โควตา AI ไม่เพียงพอหรือส่งคำขอบ่อยเกินไป");
  }
  return new ApiError(502, "AI_CONNECTION_FAILED", "เชื่อมต่อ AI ไม่สำเร็จ กรุณาตรวจสอบ provider และ model");
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireAdminSession();
    const body = await request.json() as { provider?: unknown };
    return NextResponse.json({ data: await testAiConnection(body.provider), requestId });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new ApiError(400, "VALIDATION_ERROR", "ผู้ให้บริการ AI ไม่ถูกต้อง"), requestId);
    }
    return errorResponse(connectionError(error), requestId);
  }
}
