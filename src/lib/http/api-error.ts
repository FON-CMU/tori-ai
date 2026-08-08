import { NextResponse } from "next/server";

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors, requestId } }, { status: error.status });
  }

  console.error(JSON.stringify({ level: "error", requestId, message: error instanceof Error ? error.message : "Unknown error" }));
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่", requestId } }, { status: 500 });
}
