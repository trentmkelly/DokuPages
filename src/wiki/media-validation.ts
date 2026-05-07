import { mediaName } from "./media-service";

export const MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "csv",
  "gif",
  "jpeg",
  "jpg",
  "json",
  "md",
  "pdf",
  "png",
  "svg",
  "txt",
  "webp",
  "zip"
]);

const EXPECTED_MIME_TYPES: Record<string, string[]> = {
  avif: ["image/avif"],
  bmp: ["image/bmp", "image/x-ms-bmp"],
  csv: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  gif: ["image/gif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  json: ["application/json", "text/plain"],
  md: ["text/markdown", "text/plain"],
  pdf: ["application/pdf"],
  png: ["image/png"],
  svg: ["image/svg+xml"],
  txt: ["text/plain"],
  webp: ["image/webp"],
  zip: ["application/zip", "application/x-zip-compressed"]
};

const SVG_ACTIVE_CONTENT_PATTERNS = [
  /<\s*script\b/i,
  /<\s*foreignobject\b/i,
  /<!doctype\b/i,
  /<!entity\b/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i
];

export interface ValidateMediaUploadInput {
  id: string;
  body: ArrayBuffer;
  mimeType?: string | null;
  maxBytes?: number;
}

export type MediaUploadValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export function validateMediaUpload(input: ValidateMediaUploadInput): MediaUploadValidationResult {
  const maxBytes = input.maxBytes ?? MEDIA_UPLOAD_MAX_BYTES;

  if (input.body.byteLength > maxBytes) {
    return {
      ok: false,
      error: `Media uploads are limited to ${maxBytes.toLocaleString("en-US")} bytes.`
    };
  }

  const extension = mediaExtension(input.id);

  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      error: `Media type '.${extension || "unknown"}' is not allowed.`
    };
  }

  const mimeType = normalizeMimeType(input.mimeType);

  if (mimeType && !isGenericMimeType(mimeType) && !mimeMatchesExtension(extension, mimeType)) {
    return {
      ok: false,
      error: `MIME type '${mimeType}' does not match media type '.${extension}'.`
    };
  }

  if (extension === "svg" || mimeType === "image/svg+xml") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.body);

    if (SVG_ACTIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(text))) {
      return {
        ok: false,
        error:
          "SVG uploads cannot contain scripts, event handlers, external entities, or active links."
      };
    }
  }

  return { ok: true };
}

function mediaExtension(id: string): string {
  const name = mediaName(id);
  const marker = name.lastIndexOf(".");
  return marker === -1 ? "" : name.slice(marker + 1).toLowerCase();
}

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0].trim().toLowerCase();
}

function isGenericMimeType(mimeType: string): boolean {
  return mimeType === "application/octet-stream" || mimeType === "binary/octet-stream";
}

function mimeMatchesExtension(extension: string, mimeType: string): boolean {
  return (EXPECTED_MIME_TYPES[extension] ?? []).includes(mimeType);
}
