import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyBackupDirectory } from "../scripts/verify-cloudflare-backup.mjs";

describe("Cloudflare backup verifier", () => {
  it("accepts complete D1 and R2 backup manifests", async () => {
    const backup = await backupFixture();

    await writeFile(path.join(backup, "d1.sql"), "-- d1 export\n");
    await mkdir(path.join(backup, "r2"), { recursive: true });
    await writeFile(path.join(backup, "r2", "logo"), "logo");
    await writeManifest(backup, {
      d1: { path: "d1.sql" },
      objects: [
        {
          objectKey: "media/current/wiki/logo.svg",
          path: "r2/logo",
          mimeType: "image/svg+xml",
          byteLength: 4,
          contentHash: "sha256:logo"
        }
      ]
    });

    await expect(verifyBackupDirectory(backup)).resolves.toMatchObject({
      ok: true,
      objectCount: 1,
      totalObjectBytes: 4,
      issues: []
    });
  });

  it("reports missing files, duplicate object keys, and byte mismatches", async () => {
    const backup = await backupFixture();
    await writeFile(path.join(backup, "d1.sql"), "-- d1 export\n");
    await mkdir(path.join(backup, "r2"), { recursive: true });
    await writeFile(path.join(backup, "r2", "logo"), "logo");
    await writeManifest(backup, {
      d1: { path: "missing.sql" },
      objects: [
        {
          objectKey: "media/current/wiki/logo.svg",
          path: "r2/logo",
          byteLength: 12
        },
        {
          objectKey: "media/current/wiki/logo.svg",
          path: "r2/missing",
          byteLength: 4
        }
      ]
    });

    const result = await verifyBackupDirectory(backup);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "missing.sql" }),
        expect.objectContaining({
          path: "r2/logo",
          reason: "Expected 12 bytes but found 4."
        }),
        expect.objectContaining({
          path: "r2/missing"
        }),
        expect.objectContaining({
          reason: "Duplicate objectKey 'media/current/wiki/logo.svg'."
        })
      ])
    );
  });
});

async function backupFixture() {
  return mkdtemp(path.join(tmpdir(), "dokuwiki-backup-"));
}

async function writeManifest(backup, overrides) {
  const manifest = {
    version: 1,
    createdAt: "2026-05-12T00:00:00.000Z",
    source: {
      database: "dokuwiki_pages_dev",
      bucket: "dokuwiki-pages-dev-media",
      mode: "remote"
    },
    d1: null,
    objects: [],
    ...overrides
  };

  await writeFile(path.join(backup, "backup-manifest.json"), `${JSON.stringify(manifest)}\n`);
}
