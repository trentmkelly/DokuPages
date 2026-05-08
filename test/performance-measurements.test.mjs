import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measureFileTree } from "../scripts/measure-performance.mjs";

describe("performance measurement helpers", () => {
  it("measures file counts, total bytes, and largest files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-performance-measure-"));
    await mkdir(path.join(root, "images"), { recursive: true });
    await writeFile(path.join(root, "index.html"), "hello");
    await writeFile(path.join(root, "images", "logo.bin"), Buffer.alloc(12));
    await writeFile(path.join(root, "style.css"), "body{}");

    const measured = await measureFileTree(root);

    expect(measured).toMatchObject({
      root,
      fileCount: 3,
      bytes: 23
    });
    expect(measured.largest).toEqual([
      { path: "images/logo.bin", bytes: 12 },
      { path: "style.css", bytes: 6 },
      { path: "index.html", bytes: 5 }
    ]);
  });
});
