import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("responsive shell CSS", () => {
  it("keeps mobile navigation available at narrow viewport breakpoints", async () => {
    const css = await readFile("public/dokuwiki.css", "utf8");

    expect(css).toContain("@media only screen and (max-width: 800px)");
    expect(css).toContain("@media only screen and (max-width: 520px)");
    expect(css).toMatch(
      /@media only screen and \(max-width: 520px\) \{[\s\S]*#dokuwiki__usertools \{[\s\S]*display: block;/
    );
    expect(css).toMatch(
      /@media only screen and \(max-width: 520px\) \{[\s\S]*#dokuwiki__sitetools ul,[\s\S]*display: none;/
    );
    expect(css).toMatch(
      /@media only screen and \(max-width: 520px\) \{[\s\S]*#dokuwiki__header \.mobileTools \{[\s\S]*display: block;[\s\S]*width: 49%;/
    );
    expect(css).toMatch(
      /@media only screen and \(max-width: 520px\) \{[\s\S]*#dokuwiki__sitetools form\.search \{[\s\S]*width: 49%;/
    );
  });

  it("keeps common long-content layouts from forcing page overflow", async () => {
    const css = await readFile("public/dokuwiki.css", "utf8");

    expect(css).toMatch(/\.dokuwiki div\.page \{[\s\S]*word-wrap: break-word;/);
    expect(css).toMatch(/\.dokuwiki \.docInfo \{[\s\S]*overflow-wrap: break-word;/);
    expect(css).toMatch(/\.dokuwiki \.page dl\.diagnostics dd \{[\s\S]*overflow-wrap: anywhere;/);
    expect(css).toMatch(
      /#dokuwiki__detail div\.img_detail dl dd \{[\s\S]*overflow-wrap: anywhere;/
    );
    expect(css).toMatch(/\.dokuwiki \.page pre \{[\s\S]*overflow: auto;/);
    expect(css).not.toMatch(/font-size:\s*[^;]*vw\b/);
  });
});
