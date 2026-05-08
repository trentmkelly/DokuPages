import { describe, expect, it } from "vitest";
import {
  DEFAULT_WARM_PATHS,
  normalizeBaseUrl,
  normalizeWarmPaths,
  warmCache
} from "../scripts/warm-cache.mjs";

describe("cache warming script", () => {
  it("normalizes base URLs and warm paths", () => {
    expect(normalizeBaseUrl("https://example.com/wiki/?x=1#top").href).toBe(
      "https://example.com/wiki"
    );
    expect(normalizeWarmPaths(["wiki/start", "/wiki/start", "", " /feed.xml "])).toEqual([
      "/wiki/start",
      "/feed.xml"
    ]);
    expect(DEFAULT_WARM_PATHS).toContain("/wiki/wiki/welcome");
  });

  it("warms each URL and reports status", async () => {
    const fetched = [];
    const results = await warmCache({
      baseUrl: "https://example.com/base/",
      paths: ["/wiki/start", "feed.xml"],
      fetchImpl: async (url) => {
        fetched.push(url.href);
        return { ok: true, status: 200 };
      }
    });

    expect(fetched).toEqual(["https://example.com/wiki/start", "https://example.com/feed.xml"]);
    expect(results).toEqual([
      expect.objectContaining({ path: "/wiki/start", status: 200, ok: true }),
      expect.objectContaining({ path: "/feed.xml", status: 200, ok: true })
    ]);
  });
});
