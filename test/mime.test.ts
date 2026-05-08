import { describe, expect, it } from "vitest";
import { detectMimeType } from "../src/wiki/media-service";
import {
  extensionFromMediaId,
  getEffectiveMimeTypeConfig,
  getMimeTypeForExtension,
  listDefaultMimeTypes,
  shouldForceDownloadExtension,
  shouldForceDownloadMedia
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

  it("resolves imported mime.local.conf force-download metadata", async () => {
    const db = mimeConfigD1({
      foo: {
        extension: "foo",
        mimeType: "text/x-foo",
        forceDownload: true
      }
    });

    await expect(getEffectiveMimeTypeConfig(db, "foo")).resolves.toEqual({
      extension: "foo",
      mimeType: "text/x-foo",
      forceDownload: true
    });
    await expect(shouldForceDownloadMedia(db, "wiki:file.foo")).resolves.toBe(true);
  });

  it("forces unknown extensions to download like DokuWiki fetch.php", async () => {
    await expect(shouldForceDownloadMedia(mimeConfigD1({}), "wiki:file.unknown")).resolves.toBe(
      true
    );
    expect(extensionFromMediaId("wiki:archive.tar.gz")).toBe("gz");
  });

  it("exposes the default map for config export or validation", () => {
    expect(listDefaultMimeTypes()).toContainEqual({
      extension: "svg",
      mimeType: "image/svg+xml",
      forceDownload: false
    });
  });
});

function mimeConfigD1(entries: Record<string, unknown>): D1Database {
  return {
    prepare: () =>
      ({
        bind: (extension: string) => ({
          first: async () => {
            const value = entries[extension];
            return value ? { value_json: JSON.stringify(value) } : null;
          }
        })
      }) as unknown as D1PreparedStatement
  } as unknown as D1Database;
}
