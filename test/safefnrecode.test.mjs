import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildImportPlan } from "../scripts/import-dokuwiki.mjs";
import {
  applySafeFnRecodePlan,
  buildSafeFnRecodePlan,
  recodeSafeFileName
} from "../scripts/safefnrecode.mjs";

describe("safefnrecode operator script", () => {
  it("matches upstream SafeFN dot-to-bracket recoding", () => {
    expect(recodeSafeFileName("caf%5l..png")).toBe("caf%5l].png");
    expect(recodeSafeFileName("caf%5l.png")).toBe("caf%5l]png");
    expect(recodeSafeFileName("caf%5l")).toBe("caf%5l]");
    expect(recodeSafeFileName("caf%5l].png")).toBe("caf%5l].png");
    expect(recodeSafeFileName("plain.png")).toBe("plain.png");
  });

  it("plans and applies source-tree recodes before import", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-safefnrecode-"));
    await mkdir(path.join(root, "conf"), { recursive: true });
    await mkdir(path.join(root, "data/pages/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media_attic/wiki"), { recursive: true });
    await mkdir(path.join(root, "data/media_meta/wiki"), { recursive: true });
    await writeFile(path.join(root, "conf/local.php"), "$conf['fnencode'] = 'safe';\n");
    await writeFile(path.join(root, "data/pages/wiki/caf%5l..txt"), "====== Safe ======\n");
    await writeFile(path.join(root, "data/media/wiki/caf%5l..png"), "png");
    await writeFile(path.join(root, "data/media_attic/wiki/caf%5l..1767225600.png"), "old");
    await writeFile(
      path.join(root, "data/media_meta/wiki/caf%5l..png.meta"),
      'a:1:{s:4:"Exif";a:1:{s:5:"Title";s:4:"Cafe";}}'
    );

    const plan = await buildSafeFnRecodePlan(root);
    expect(plan.entries.map((entry) => entry.relativeTarget).sort()).toEqual([
      "data/media/wiki/caf%5l].png",
      "data/media_attic/wiki/caf%5l].1767225600.png",
      "data/media_meta/wiki/caf%5l].png.meta",
      "data/pages/wiki/caf%5l].txt"
    ]);

    await applySafeFnRecodePlan(plan);
    await expect(stat(path.join(root, "data/media/wiki/caf%5l].png"))).resolves.toBeTruthy();
    await expect(readFile(path.join(root, "data/media/wiki/caf%5l..png"))).rejects.toMatchObject({
      code: "ENOENT"
    });

    const importPlan = await buildImportPlan(root);
    expect(importPlan.pages).toContainEqual(expect.objectContaining({ id: "wiki:café" }));
    expect(importPlan.media).toContainEqual(expect.objectContaining({ id: "wiki:café.png" }));
  });

  it("reports conflicts instead of overwriting existing files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-safefnrecode-conflict-"));
    await mkdir(path.join(root, "data/media/wiki"), { recursive: true });
    await writeFile(path.join(root, "data/media/wiki/caf%5l..png"), "old");
    await writeFile(path.join(root, "data/media/wiki/caf%5l].png"), "new");

    const plan = await buildSafeFnRecodePlan(root);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      relativeSource: "data/media/wiki/caf%5l..png",
      relativeTarget: "data/media/wiki/caf%5l].png",
      conflict: "target already exists"
    });
    await expect(applySafeFnRecodePlan(plan)).rejects.toThrow("conflict");
  });
});
