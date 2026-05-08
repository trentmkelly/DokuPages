import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createUploadState,
  isObjectUploaded,
  loadUploadState,
  markObjectUploaded,
  writeUploadState
} from "../scripts/upload-r2-media.mjs";

describe("R2 media upload resume state", () => {
  it("matches completed uploads by object key, hash, size, and source path", () => {
    const state = createUploadState();
    const object = mediaObject();

    expect(isObjectUploaded(state, object)).toBe(false);

    markObjectUploaded(state, object);

    expect(isObjectUploaded(state, object)).toBe(true);
    expect(isObjectUploaded(state, { ...object, contentHash: "sha256:new" })).toBe(false);
    expect(isObjectUploaded(state, { ...object, byteLength: object.byteLength + 1 })).toBe(false);
    expect(isObjectUploaded(state, { ...object, sourcePath: "/tmp/other/logo.svg" })).toBe(false);
  });

  it("persists and reloads upload state for interrupted imports", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dokuwiki-media-upload-state-"));
    const stateFile = path.join(root, "state", "media-upload.json");
    const object = mediaObject();
    const state = createUploadState();

    markObjectUploaded(state, object);
    await writeUploadState(stateFile, state);

    const raw = JSON.parse(await readFile(stateFile, "utf8"));
    expect(raw.completed[object.objectKey]).toMatchObject({
      sourcePath: object.sourcePath,
      contentHash: object.contentHash,
      byteLength: object.byteLength
    });

    const loaded = await loadUploadState(stateFile);
    expect(isObjectUploaded(loaded, object)).toBe(true);

    const missing = await loadUploadState(path.join(root, "missing.json"));
    expect(missing).toEqual(createUploadState());
  });
});

function mediaObject() {
  return {
    objectKey: "media/current/wiki/logo.svg",
    sourcePath: "/tmp/wiki/data/media/wiki/logo.svg",
    contentHash: "sha256:logo",
    byteLength: 12
  };
}
