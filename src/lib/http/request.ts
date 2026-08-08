export function getRequestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function logRequest(requestId: string, event: string, metadata: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ level: "info", requestId, event, ...metadata }));
}
