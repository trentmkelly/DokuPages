import { describe, expect, it } from "vitest";
import { detectMimeType } from "../src/wiki/media-service";
import {
  getMimeTypeForExtension,
  listDefaultMimeTypes,
  shouldForceDownloadExtension
} from "../src/wiki/mime";

describe("DokuWiki MIME mapping", () => {
  it("maps default DokuWiki extensions to MIME types", () => {
    expect(getMimeTypeForExtension("jpg")).toBe("image/jpeg");
    expect(getMimeTypeForExtension(".docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(getMimeTypeForExtension("txt")).toBeNull();
  });

  it("preserves DokuWiki forced-download MIME entries", () => {
    expect(shouldForceDownloadExtension("zip")).toBe(true);
    expect(shouldForceDownloadExtension("svg")).toBe(false);
  });

  it("uses the DokuWiki map for media MIME detection", () => {
    expect(detectMimeType("wiki:archive.zip")).toBe("application/zip");
    expect(detectMimeType("wiki:icon.ico")).toBe("image/vnd.microsoft.icon");
    expect(detectMimeType("wiki:notes.txt")).toBe("application/octet-stream");
  });

  it("exposes the default map for config export or validation", () => {
    expect(listDefaultMimeTypes()).toContainEqual({
      extension: "svg",
      mimeType: "image/svg+xml",
      forceDownload: false
    });
  });
});
