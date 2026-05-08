import { describe, expect, it } from "vitest";
import { UPLOAD_XSS_MESSAGE, validateMediaUpload } from "../src/wiki/media-validation";

const encoder = new TextEncoder();

describe("validateMediaUpload", () => {
  it("accepts common safe media extensions", () => {
    expect(
      validateMediaUpload({
        id: "wiki:image.png",
        body: encoder.encode("png").buffer,
        mimeType: "image/png"
      })
    ).toEqual({ ok: true });
  });

  it("rejects uploads above the configured size limit", () => {
    expect(
      validateMediaUpload({
        id: "wiki:large.txt",
        body: encoder.encode("too large").buffer,
        mimeType: "text/plain",
        maxBytes: 4
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("limited")
    });
  });

  it("rejects unsupported executable-style extensions", () => {
    expect(
      validateMediaUpload({
        id: "wiki:shell.php",
        body: encoder.encode("<?php").buffer,
        mimeType: "application/x-httpd-php"
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("not allowed")
    });
  });

  it("accepts extensions and MIME types supplied by imported DokuWiki config", () => {
    expect(
      validateMediaUpload({
        id: "wiki:custom.foo",
        body: encoder.encode("custom").buffer,
        mimeType: "text/x-foo",
        mimePolicy: { mimeType: "text/x-foo" }
      })
    ).toEqual({ ok: true });
  });

  it("rejects mismatched MIME types", () => {
    expect(
      validateMediaUpload({
        id: "wiki:image.png",
        body: encoder.encode("png").buffer,
        mimeType: "text/plain"
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("does not match")
    });
  });

  it("rejects upstream IE-XSS upload patterns when iexssprotect is enabled", () => {
    expect(
      validateMediaUpload({
        id: "wiki:bad.svg",
        body: encoder.encode("<svg><script>alert(1)</script></svg>").buffer,
        mimeType: "image/svg+xml"
      })
    ).toEqual({
      ok: false,
      error: UPLOAD_XSS_MESSAGE
    });
  });

  it("allows SVG active-content patterns when iexssprotect is disabled", () => {
    expect(
      validateMediaUpload({
        id: "wiki:trusted.svg",
        body: encoder.encode("<svg><script>alert(1)</script></svg>").buffer,
        mimeType: "image/svg+xml",
        ieXssProtect: false
      })
    ).toEqual({ ok: true });
  });

  it("matches DokuWiki's first-256-byte iexssprotect scan window", () => {
    expect(
      validateMediaUpload({
        id: "wiki:late.svg",
        body: encoder.encode(`${" ".repeat(256)}<script>alert(1)</script>`).buffer,
        mimeType: "image/svg+xml"
      })
    ).toEqual({ ok: true });
  });
});
