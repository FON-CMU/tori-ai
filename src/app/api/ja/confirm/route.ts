import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { getRequestId } from "@/lib/http/request";
import { confirmJa } from "@/server/services/ja-service";
export async function POST(request: Request) { const id = getRequestId(request); try { const session = await requireSession(); return NextResponse.json({ data: await confirmJa(session.userId, await request.json()), requestId: id }, { status: 201 }); } catch (error) { return errorResponse(error, id); } }
