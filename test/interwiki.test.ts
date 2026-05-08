import { describe, expect, it } from "vitest";
import { resolveInterwikiLink } from "../src/wiki/interwiki";

describe("interwiki links", () => {
  it("resolves upstream DokuWiki interwiki shortcuts", () => {
    expect(resolveInterwikiLink("doku>faq:sidebar")).toEqual({
      href: "https://www.dokuwiki.org/faq:sidebar",
      external: true
    });
    expect(resolveInterwikiLink("wp>Wiki")).toEqual({
      href: "https://en.wikipedia.org/wiki/Wiki",
      external: true
    });
    expect(resolveInterwikiLink("google>two words")).toEqual({
      href: "https://www.google.com/search?q=two%20words",
      external: true
    });
  });

  it("resolves local interwiki shortcuts to local routes", () => {
    expect(resolveInterwikiLink("this>doku.php?do=admin&page=config")).toEqual({
      href: "/doku.php?do=admin&page=config",
      external: false
    });
    expect(resolveInterwikiLink("user>Jane Doe")).toEqual({
      href: "/wiki/user/jane_doe",
      external: false
    });
  });

  it("resolves imported interwiki shortcuts and overrides", () => {
    expect(
      resolveInterwikiLink("docs>Quick Start", {
        docs: "https://docs.example/{URL}",
        wp: "https://wiki.example/{NAME}"
      })
    ).toEqual({
      href: "https://docs.example/Quick%20Start",
      external: true
    });
    expect(resolveInterwikiLink("wp>Custom Wiki", { wp: "https://wiki.example/{NAME}" })).toEqual({
      href: "https://wiki.example/Custom_Wiki",
      external: true
    });
  });
});
