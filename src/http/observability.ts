import { jsonResponse } from "./responses";

type RequestHandler = () => Promise<Response>;

export async function withRequestObservability(
  request: Request,
  handler: RequestHandler
): Promise<Response> {
  const requestId = getRequestId(request);
  const startedAt = Date.now();

  try {
    const response = await handler();
    response.headers.set("x-request-id", requestId);
    logRequest(request, requestId, response.status, Date.now() - startedAt);
    return response;
  } catch (error) {
    logError(request, requestId, Date.now() - startedAt, error);
    const response = jsonResponse(
      {
        error: "Internal server error.",
        requestId
      },
      { status: 500 }
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }
}

function getRequestId(request: Request): string {
  return (
    request.headers.get("cf-ray") ??
    request.headers.get("x-request-id") ??
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function logRequest(request: Request, requestId: string, status: number, durationMs: number): void {
  const url = new URL(request.url);
  console.log(
    JSON.stringify({
      level: "info",
      event: "request",
      requestId,
      method: request.method,
      path: url.pathname,
      status,
      durationMs
    })
  );
}

function logError(request: Request, requestId: string, durationMs: number, error: unknown): void {
  const url = new URL(request.url);
  const exception = error instanceof Error ? error : new Error(String(error));

  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      requestId,
      method: request.method,
      path: url.pathname,
      durationMs,
      error: {
        name: exception.name,
        message: exception.message,
        stack: exception.stack
      }
    })
  );
}
