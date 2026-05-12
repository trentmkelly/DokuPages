import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("visual regression script", () => {
  it("captures Pages and upstream screenshots for the required parity states", async () => {
    const source = await readFile("scripts/visual-regression.mjs", "utf8");
    const cases = [
      ["page view", "/wiki/wiki/welcome", "/doku.php?id=wiki:welcome"],
      ["edit", "/wiki/wiki/welcome?do=edit", "/doku.php?id=wiki:welcome&do=edit"],
      ["revisions", "/wiki/wiki/welcome?do=revisions", "/doku.php?id=wiki:welcome&do=revisions"],
      ["diff", "/wiki/wiki/welcome?do=diff", "/doku.php?id=wiki:welcome&do=diff"],
      ["media manager", "/media-manager?ns=wiki", "/doku.php?id=wiki:welcome&do=media&ns=wiki"],
      ["login", "/wiki/wiki/welcome?do=login", "/doku.php?id=wiki:welcome&do=login"],
      ["register", "/wiki/wiki/welcome?do=register", "/doku.php?id=wiki:welcome&do=register"],
      ["admin", "/admin", "/doku.php?id=wiki:welcome&do=admin"],
      ["missing page", "/wiki/start", "/doku.php?id=start"]
    ];

    expect(source).toContain("--upstream-url");
    expect(source).toContain(".pages.png");
    expect(source).toContain(".upstream.png");
    expect(source).toContain("version: 2");
    expect(source).toContain("requireUpstream: Boolean(args.upstreamUrl)");
    expect(source).toContain("compareSourcePresence");
    expect(source).toContain("hashGate: true");
    expect(source).toContain("hashGate: false");

    for (const [state, pagesPath, upstreamPath] of cases) {
      expect(source).toContain(`state: "${state}"`);
      expect(source).toContain(`pagesPath: "${pagesPath}"`);
      expect(source).toContain(`upstreamPath: "${upstreamPath}"`);
    }
  });
});
