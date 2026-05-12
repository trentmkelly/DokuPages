import { describe, expect, it, vi } from "vitest";
import { withRequestObservability } from "../src/http/observability";

describe("withRequestObservability", () => {
  it("adds request IDs and emits structured request logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const response = await withRequestObservability(
        new Request("https://example.com/wiki/start", {
          headers: {
            "cf-ray": "request-123"
          }
        }),
        async () => new Response("ok")
      );

      expect(response.headers.get("x-request-id")).toBe("request-123");
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
        level: "info",
        event: "request",
        requestId: "request-123",
        method: "GET",
        path: "/wiki/start",
        status: 200
      });
    } finally {
      log.mockRestore();
    }
  });

  it("logs thrown errors and returns request-id tagged 500 responses", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await withRequestObservability(
        new Request("https://example.com/broken", {
          headers: {
            "x-request-id": "request-456"
          }
        }),
        async () => {
          throw new Error("boom");
        }
      );

      expect(response.status).toBe(500);
      expect(response.headers.get("x-request-id")).toBe("request-456");
      await expect(response.json()).resolves.toMatchObject({
        error: "Internal server error.",
        requestId: "request-456"
      });
      expect(error).toHaveBeenCalledOnce();
      expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
        level: "error",
        event: "request_error",
        requestId: "request-456",
        method: "GET",
        path: "/broken",
        error: {
          message: "boom"
        }
      });
    } finally {
      error.mockRestore();
    }
  });

  it("honors DokuWiki dontlog for request debug logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const response = await withRequestObservability(
        new Request("https://example.com/wiki/start", {
          headers: {
            "cf-ray": "request-quiet"
          }
        }),
        async () => new Response("ok"),
        { dontLog: ["debug"] }
      );

      expect(response.headers.get("x-request-id")).toBe("request-quiet");
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("honors DokuWiki dontlog for request error logs", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await withRequestObservability(
        new Request("https://example.com/broken", {
          headers: {
            "x-request-id": "request-muted-error"
          }
        }),
        async () => {
          throw new Error("boom");
        },
        { dontLog: ["error"] }
      );

      expect(response.status).toBe(500);
      expect(response.headers.get("x-request-id")).toBe("request-muted-error");
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("maps known storage errors to stable service responses", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await withRequestObservability(
        new Request("https://example.com/wiki/start", {
          headers: {
            "x-request-id": "request-789"
          }
        }),
        async () => {
          throw new Error("D1_ERROR: database is locked");
        }
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("x-request-id")).toBe("request-789");
      await expect(response.json()).resolves.toMatchObject({
        error: "Storage is temporarily unavailable. Try again later.",
        code: "storage_unavailable",
        service: "d1",
        retryable: true,
        requestId: "request-789"
      });
      expect(error).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
        storage: {
          code: "storage_unavailable",
          service: "d1",
          retryable: true
        }
      });
      expect(JSON.parse(String(error.mock.calls[1][0]))).toMatchObject({
        level: "error",
        event: "storage_error",
        requestId: "request-789",
        method: "GET",
        path: "/wiki/start",
        storage: {
          code: "storage_unavailable",
          service: "d1",
          status: 503,
          retryable: true
        }
      });
    } finally {
      error.mockRestore();
    }
  });
});
