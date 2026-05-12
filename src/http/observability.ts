import { jsonResponse } from "./responses";
import { isDokuWikiLogFacilityEnabled, type DokuWikiLogFacility } from "../config";
import { mapStorageError, type MappedStorageError } from "../storage/errors";

type RequestHandler = () => Promise<Response>;

export interface RequestObservabilityOptions {
  dontLog?: readonly DokuWikiLogFacility[];
}

export async function withRequestObservability(
  request: Request,
  handler: RequestHandler,
  options: RequestObservabilityOptions = {}
): Promise<Response> {
  const requestId = getRequestId(request);
  const startedAt = Date.now();

  try {
    const response = await handler();
    response.headers.set("x-request-id", requestId);
    if (shouldLog(options, "debug")) {
      logRequest(request, requestId, response.status, Date.now() - startedAt);
    }
    return response;
  } catch (error) {
    const storageError = logError(request, requestId, Date.now() - startedAt, error, options);
    if (storageError) {
      const response = jsonResponse(
        {
          error: storageError.message,
          code: storageError.code,
          service: storageError.service,
          retryable: storageError.retryable,
          requestId
        },
        { status: storageError.status }
      );
      response.headers.set("x-request-id", requestId);
      return response;
    }

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

function shouldLog(options: RequestObservabilityOptions, facility: DokuWikiLogFacility): boolean {
  return isDokuWikiLogFacilityEnabled({ dontLog: options.dontLog ?? [] }, facility);
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

function logError(
  request: Request,
  requestId: string,
  durationMs: number,
  error: unknown,
  options: RequestObservabilityOptions
): MappedStorageError | null {
  const url = new URL(request.url);
  const exception = error instanceof Error ? error : new Error(String(error));
  const storageError = mapStorageError(exception);

  if (shouldLog(options, "error")) {
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
        },
        storage: storageError
          ? {
              code: storageError.code,
              service: storageError.service,
              retryable: storageError.retryable
            }
          : undefined
      })
    );
  }

  if (storageError && shouldLog(options, "error")) {
    logStorageError(request, requestId, durationMs, storageError);
  }

  return storageError;
}

function logStorageError(
  request: Request,
  requestId: string,
  durationMs: number,
  storageError: MappedStorageError
): void {
  const url = new URL(request.url);

  console.error(
    JSON.stringify({
      level: "error",
      event: "storage_error",
      requestId,
      method: request.method,
      path: url.pathname,
      durationMs,
      storage: {
        code: storageError.code,
        service: storageError.service,
        status: storageError.status,
        retryable: storageError.retryable
      }
    })
  );
}
