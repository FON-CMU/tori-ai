import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

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

  if (error instanceof ZodError) {
    const fieldErrors: FieldErrors = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_form";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่",
          fieldErrors,
          requestId,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว กรุณาลองใหม่",
          requestId,
        },
      },
      { status: 409 },
    );
  }

  console.error(JSON.stringify({ level: "error", requestId, message: error instanceof Error ? error.message : "Unknown error" }));
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่", requestId } }, { status: 500 });
}
