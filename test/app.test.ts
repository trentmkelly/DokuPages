import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import type { Env } from "../src/env";

const env = {
  DB: {} as D1Database,
  MEDIA_BUCKET: {} as R2Bucket,
  RENDER_CACHE: {} as KVNamespace,
  PAGE_LOCKS: {} as DurableObjectNamespace,
  SITE_NAME: "Test Wiki"
} satisfies Env;

describe("handleRequest", () => {
  it("returns health information for the API health route", async () => {
    const response = await handleRequest(new Request("https://example.com/api/health"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      bindings: {
        d1: true,
        r2: true,
        kv: true,
        durableObjects: true
      }
    });
  });

  it("handles wiki routes through the Pages Function router", async () => {
    const response = await handleRequest(new Request("https://example.com/wiki/Wiki/Welcome"), env);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("<h1>wiki:welcome</h1>");
  });

  it("falls back to static assets for non-dynamic routes", async () => {
    const response = await handleRequest(
      new Request("https://example.com/"),
      env,
      async () => new Response("static asset")
    );

    await expect(response.text()).resolves.toBe("static asset");
  });
});
