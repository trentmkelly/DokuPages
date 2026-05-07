import { describe, expect, it } from "vitest";
import { verifyD1Hashes, verifyObservedR2Hashes } from "../scripts/verify-import-hashes.mjs";

describe("import hash verifier", () => {
  const manifest = {
    pages: [
      {
        revisionId: "wiki:start@2026-01-01T00:00:00.000Z",
        contentHash: "page-hash"
      }
    ],
    pageRevisions: [
      {
        revisionId: "wiki:start@2025-12-31T00:00:00.000Z",
        contentHash: "old-page-hash"
      }
    ],
    mediaObjects: [
      {
        role: "current",
        mediaId: "wiki:logo.svg",
        revisionId: "wiki:logo.svg@2026-01-01T00:00:00.000Z",
        objectKey: "media/current/wiki/logo.svg",
        contentHash: "media-hash"
      },
      {
        role: "revision",
        mediaId: "wiki:logo.svg",
        revisionId: "wiki:logo.svg@2025-12-31T00:00:00.000Z",
        objectKey: "media/revisions/wiki/logo.svg/1767139200",
        contentHash: "old-media-hash"
      }
    ]
  };

  it("matches D1 page and media hashes", () => {
    expect(
      verifyD1Hashes(manifest, {
        pageRevisions: [
          { id: "wiki:start@2026-01-01T00:00:00.000Z", content_hash: "page-hash" },
          { id: "wiki:start@2025-12-31T00:00:00.000Z", content_hash: "old-page-hash" }
        ],
        media: [{ id: "wiki:logo.svg", content_hash: "media-hash" }],
        mediaRevisions: [
          { id: "wiki:logo.svg@2025-12-31T00:00:00.000Z", content_hash: "old-media-hash" }
        ]
      })
    ).toEqual([
      { ok: true, kind: "page", id: "wiki:start@2026-01-01T00:00:00.000Z" },
      { ok: true, kind: "page_revision", id: "wiki:start@2025-12-31T00:00:00.000Z" },
      { ok: true, kind: "media_current", id: "wiki:logo.svg" },
      { ok: true, kind: "media_revision", id: "wiki:logo.svg@2025-12-31T00:00:00.000Z" }
    ]);
  });

  it("reports missing and mismatched hashes", () => {
    expect(
      verifyD1Hashes(manifest, {
        pageRevisions: [{ id: "wiki:start@2026-01-01T00:00:00.000Z", content_hash: "wrong" }],
        media: [],
        mediaRevisions: []
      }).filter((check) => !check.ok)
    ).toEqual([
      {
        ok: false,
        kind: "page",
        id: "wiki:start@2026-01-01T00:00:00.000Z",
        expected: "page-hash",
        actual: "wrong",
        reason: "mismatch"
      },
      {
        ok: false,
        kind: "page_revision",
        id: "wiki:start@2025-12-31T00:00:00.000Z",
        expected: "old-page-hash",
        actual: null,
        reason: "missing"
      },
      {
        ok: false,
        kind: "media_current",
        id: "wiki:logo.svg",
        expected: "media-hash",
        actual: null,
        reason: "missing"
      },
      {
        ok: false,
        kind: "media_revision",
        id: "wiki:logo.svg@2025-12-31T00:00:00.000Z",
        expected: "old-media-hash",
        actual: null,
        reason: "missing"
      }
    ]);
  });

  it("matches observed R2 object hashes", () => {
    expect(
      verifyObservedR2Hashes(manifest, [
        { objectKey: "media/current/wiki/logo.svg", contentHash: "media-hash" },
        { objectKey: "media/revisions/wiki/logo.svg/1767139200", contentHash: "old-media-hash" }
      ])
    ).toEqual([
      { ok: true, kind: "r2_object", id: "media/current/wiki/logo.svg" },
      { ok: true, kind: "r2_object", id: "media/revisions/wiki/logo.svg/1767139200" }
    ]);
  });
});
