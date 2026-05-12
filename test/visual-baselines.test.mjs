import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const REQUIRED_CASES = [
  "page-view-desktop",
  "page-view-mobile",
  "edit-desktop",
  "revisions-desktop",
  "diff-desktop",
  "media-manager-desktop",
  "login-desktop",
  "register-desktop",
  "admin-desktop",
  "missing-page-desktop"
];

describe("visual regression baselines", () => {
  it("records Pages and running-upstream DokuWiki captures for every parity state", async () => {
    const baseline = JSON.parse(await readFile("test/visual-baselines.json", "utf8"));

    expect(baseline.version).toBe(3);
    expect(baseline.capture).toMatchObject({
      generatedBy: "scripts/visual-regression.mjs",
      upstreamSource: "running-upstream-dokuwiki"
    });
    expect(baseline.capture.pagesBaseUrl).toMatch(/^https?:\/\//);
    expect(baseline.capture.upstreamBaseUrl).toMatch(/^https?:\/\//);
    expect(baseline.cases.map((item) => item.name)).toEqual(REQUIRED_CASES);

    for (const item of baseline.cases) {
      expect(item.sources?.pages, `${item.name} pages`).toMatchObject({
        byteLength: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
      });
      expect(item.sources?.upstream, `${item.name} upstream`).toMatchObject({
        byteLength: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
      });
      expect(item.sources.pages.byteLength, `${item.name} pages size`).toBeGreaterThan(0);
      expect(item.sources.upstream.byteLength, `${item.name} upstream size`).toBeGreaterThan(0);
    }
  });
});
