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
});
