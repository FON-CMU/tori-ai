import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("tori_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const response = NextResponse.next();
  response.headers.set("x-request-id", request.headers.get("x-request-id") ?? crypto.randomUUID());
  return response;
}

export const config = {
  matcher: ["/chat/:path*", "/tor/:path*", "/ja/:path*", "/dashboard/:path*", "/settings/:path*"],
};
