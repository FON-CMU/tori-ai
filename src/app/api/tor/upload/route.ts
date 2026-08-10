import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { uploadTor } from "@/server/services/tor-upload-service";

/** อัปโหลดอย่างเดียว — ประมวลผล/วิเคราะห์แยก request เพื่อไม่ชนเพดาน Vercel */
export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "กรุณาเลือกไฟล์ TOR");
    const uploaded = await uploadTor(userId, file, form.get("year"));
    return NextResponse.json(
      {
        data: {
          id: uploaded.id,
          status: uploaded.status,
          year: uploaded.year,
          fileName: uploaded.fileName,
        },
        requestId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new ApiError(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "ปีไม่ถูกต้อง"), requestId);
    }
    return errorResponse(error, requestId);
  }
}
