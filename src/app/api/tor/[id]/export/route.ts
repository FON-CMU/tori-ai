import { requireSession } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { exportTorJaDocx, exportTorJaPdf } from "@/server/services/ja-export-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { userId } = await requireSession();
    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase();
    if (format !== "pdf" && format !== "docx") {
      throw new ApiError(400, "INVALID_FORMAT", "รองรับเฉพาะ format=pdf หรือ format=docx");
    }

    const file =
      format === "pdf" ? await exportTorJaPdf(userId, id) : await exportTorJaDocx(userId, id);

    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.fileName}"`,
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
