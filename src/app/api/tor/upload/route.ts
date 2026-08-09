import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { uploadTor } from "@/server/services/tor-upload-service";

// Stores the file only. Reading and AI analysis happen in a second request to
// /api/tor/[id]/process, so neither step has to fit in one invocation.
export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "กรุณาเลือกไฟล์ TOR");
    const document = await uploadTor(userId, file, form.get("year"));
    return NextResponse.json(
      {
        data: {
          id: document.id,
          status: document.status,
          year: document.year,
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
