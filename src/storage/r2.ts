import type { MediaRecord, MediaRevisionRecord, MediaStore } from "./interfaces";

type MediaObjectReference = Pick<MediaRecord | MediaRevisionRecord, "objectKey"> | string;

export class R2MediaStore implements MediaStore {
  constructor(
    private readonly metadata: MediaStore,
    private readonly bucket: R2Bucket
  ) {}

  getMedia(id: string): Promise<MediaRecord | null> {
    return this.metadata.getMedia(id);
  }

  getMediaRevision(revisionId: string): Promise<MediaRevisionRecord | null> {
    return this.metadata.getMediaRevision(revisionId);
  }

  listMediaRevisions(
    mediaId: string,
    limit: number,
    cursor?: string
  ): Promise<MediaRevisionRecord[]> {
    return this.metadata.listMediaRevisions(mediaId, limit, cursor);
  }

  async saveMedia(
    media: MediaRecord,
    body: ReadableStream<Uint8Array> | ArrayBuffer
  ): Promise<void> {
    await this.bucket.put(media.objectKey, body, {
      httpMetadata: {
        contentType: media.mimeType
      },
      customMetadata: {
        mediaId: media.id,
        contentHash: media.contentHash,
        currentRevisionId: media.currentRevisionId ?? ""
      }
    });

    try {
      await this.metadata.saveMedia(media, body);
    } catch (error) {
      await this.bucket.delete(media.objectKey).catch(() => undefined);
      throw error;
    }
  }

  getMediaObject(reference: MediaObjectReference): Promise<R2ObjectBody | null> {
    return this.bucket.get(objectKeyForReference(reference));
  }

  headMediaObject(reference: MediaObjectReference): Promise<R2Object | null> {
    return this.bucket.head(objectKeyForReference(reference));
  }

  async deleteMediaObject(reference: MediaObjectReference): Promise<void> {
    await this.bucket.delete(objectKeyForReference(reference));
  }
}

function objectKeyForReference(reference: MediaObjectReference): string {
  return typeof reference === "string" ? reference : reference.objectKey;
}
