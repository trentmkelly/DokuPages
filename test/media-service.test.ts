import { describe, expect, it } from "vitest";
import { saveMediaUpload } from "../src/wiki/media-service";

describe("saveMediaUpload", () => {
  it("removes the newly written R2 object when metadata persistence fails", async () => {
    const d1 = new FailingBatchD1(new Error("D1 metadata write failed"));
    const bucket = new MemoryR2Bucket();
    const body = new TextEncoder().encode("partial upload").buffer;

    await expect(
      saveMediaUpload(d1 as unknown as D1Database, bucket as unknown as R2Bucket, {
        id: "wiki:broken.txt",
        body,
        mimeType: "text/plain",
        summary: "Upload should roll back",
        overwrite: false,
        now: new Date("2026-05-07T00:00:00.000Z")
      })
    ).rejects.toThrow("D1 metadata write failed");

    expect(bucket.objects.size).toBe(0);
    expect(bucket.deletedKeys).toEqual([
      "media/revisions/wiki/broken.txt/wiki%3Abroken.txt%402026-05-07T00%3A00%3A00.000Z"
    ]);
  });
});

class FailingBatchD1 {
  constructor(private readonly error: Error) {}

  prepare(sql: string): D1PreparedStatement {
    return new MinimalD1Statement(sql) as unknown as D1PreparedStatement;
  }

  async batch(): Promise<D1Result[]> {
    throw this.error;
  }
}

class MinimalD1Statement {
  readonly values: unknown[] = [];

  constructor(readonly sql: string) {}

  bind(...values: unknown[]): MinimalD1Statement {
    this.values.push(...values);
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return null;
  }
}

class MemoryR2Bucket {
  readonly objects = new Map<string, BodyInit>();
  readonly deletedKeys: string[] = [];

  async put(key: string, value: BodyInit): Promise<R2Object> {
    this.objects.set(key, value);
    return { key } as R2Object;
  }

  async delete(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}
