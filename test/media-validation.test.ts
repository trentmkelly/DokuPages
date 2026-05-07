import { describe, expect, it } from "vitest";
import { validateMediaUpload } from "../src/wiki/media-validation";

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

  it("rejects active SVG content", () => {
    expect(
      validateMediaUpload({
        id: "wiki:bad.svg",
        body: encoder.encode('<svg onload="alert(1)"></svg>').buffer,
        mimeType: "image/svg+xml"
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("SVG")
    });
  });
});
