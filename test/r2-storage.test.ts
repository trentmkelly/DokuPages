import { describe, expect, it } from "vitest";
import { R2MediaStore } from "../src/storage/r2";
import type { MediaRecord, MediaRevisionRecord, MediaStore } from "../src/storage/interfaces";

describe("R2MediaStore", () => {
  it("stores media bodies in R2 and metadata in the composed store", async () => {
    const metadata = new MemoryMediaStore();
    const bucket = new MemoryR2Bucket();
    const store = new R2MediaStore(metadata, bucket as unknown as R2Bucket);
    const media = mediaRecord();
    const body = new TextEncoder().encode("<svg></svg>").buffer;

    await store.saveMedia(media, body);

    expect(metadata.savedMedia).toEqual([media]);
    expect(bucket.objects.get(media.objectKey)?.body).toEqual(body);
    expect(bucket.objects.get(media.objectKey)?.options).toMatchObject({
      httpMetadata: {
        contentType: "image/svg+xml"
      },
      customMetadata: {
        mediaId: "wiki:logo.svg",
        contentHash: "hash"
      }
    });
    await expect(store.getMedia("wiki:logo.svg")).resolves.toEqual(media);
    await expect(store.getMediaObject(media)).resolves.toMatchObject({ key: media.objectKey });
    await expect(store.headMediaObject(media.objectKey)).resolves.toMatchObject({
      key: media.objectKey
    });
  });

  it("removes newly written R2 objects when metadata persistence fails", async () => {
    const metadata = new MemoryMediaStore(new Error("D1 write failed"));
    const bucket = new MemoryR2Bucket();
    const store = new R2MediaStore(metadata, bucket as unknown as R2Bucket);
    const media = mediaRecord();

    await expect(store.saveMedia(media, new ArrayBuffer(0))).rejects.toThrow("D1 write failed");

    expect(bucket.objects.has(media.objectKey)).toBe(false);
  });

  it("keeps metadata reads out of R2 and uses one bucket operation for object reads", async () => {
    const metadata = new MemoryMediaStore();
    const bucket = new MemoryR2Bucket();
    const store = new R2MediaStore(metadata, bucket as unknown as R2Bucket);
    const media = mediaRecord();

    await store.saveMedia(media, new ArrayBuffer(0));
    bucket.resetCounts();

    await expect(store.getMedia(media.id)).resolves.toEqual(media);
    await expect(store.listMediaRevisions(media.id, 50)).resolves.toEqual([]);
    expect(bucket.counts).toEqual({ put: 0, get: 0, head: 0, delete: 0 });

    await expect(store.getMediaObject(media)).resolves.toMatchObject({ key: media.objectKey });
    expect(bucket.counts).toEqual({ put: 0, get: 1, head: 0, delete: 0 });

    await expect(store.headMediaObject(media)).resolves.toMatchObject({ key: media.objectKey });
    expect(bucket.counts).toEqual({ put: 0, get: 1, head: 1, delete: 0 });

    await store.deleteMediaObject(media);
    expect(bucket.counts).toEqual({ put: 0, get: 1, head: 1, delete: 1 });
  });
});

function mediaRecord(): MediaRecord {
  return {
    id: "wiki:logo.svg",
    namespace: "wiki",
    objectKey: "media/wiki/logo.svg",
    mimeType: "image/svg+xml",
    byteLength: 11,
    contentHash: "hash",
    currentRevisionId: "media-rev-1",
    isDeleted: false,
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z"
  };
}

class MemoryMediaStore implements MediaStore {
  readonly savedMedia: MediaRecord[] = [];

  constructor(private readonly saveError: Error | null = null) {}

  async getMedia(id: string): Promise<MediaRecord | null> {
    return this.savedMedia.find((media) => media.id === id) ?? null;
  }

  async getMediaRevision(): Promise<MediaRevisionRecord | null> {
    return null;
  }

  async listMediaRevisions(): Promise<MediaRevisionRecord[]> {
    return [];
  }

  async saveMedia(media: MediaRecord): Promise<void> {
    if (this.saveError) throw this.saveError;
    this.savedMedia.push(media);
  }
}

class MemoryR2Bucket {
  readonly objects = new Map<
    string,
    {
      body: ReadableStream<Uint8Array> | ArrayBuffer;
      options?: R2PutOptions;
    }
  >();
  counts = { put: 0, get: 0, head: 0, delete: 0 };

  resetCounts(): void {
    this.counts = { put: 0, get: 0, head: 0, delete: 0 };
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer,
    options?: R2PutOptions
  ): Promise<R2Object> {
    this.counts.put += 1;
    this.objects.set(key, { body, options });
    return { key } as R2Object;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    this.counts.get += 1;
    return this.objects.has(key) ? ({ key } as R2ObjectBody) : null;
  }

  async head(key: string): Promise<R2Object | null> {
    this.counts.head += 1;
    return this.objects.has(key) ? ({ key } as R2Object) : null;
  }

  async delete(key: string): Promise<void> {
    this.counts.delete += 1;
    this.objects.delete(key);
  }
}
