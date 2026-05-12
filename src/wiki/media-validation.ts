import { formatDokuWikiFileSize } from "./format";
import { mediaName } from "./media-service";
import type { MimeTypeConfig } from "./mime";

export const MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_XSS_MESSAGE = "The upload was blocked for possibly malicious content.";
const IE_XSS_SCAN_BYTES = 256;

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

const IE_XSS_PATTERN = /<(script|a|img|html|body|iframe)[\s>]/i;

export interface ValidateMediaUploadInput {
  id: string;
  body: ArrayBuffer;
  mimeType?: string | null;
  mimePolicy?: Pick<MimeTypeConfig, "mimeType"> | null;
  ieXssProtect?: boolean;
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
      error: `Media uploads are limited to ${formatDokuWikiFileSize(maxBytes)}.`
    };
  }

  const extension = mediaExtension(input.id);
  const configuredMimeType = normalizeMimeType(input.mimePolicy?.mimeType);

  if (!extension || (!ALLOWED_EXTENSIONS.has(extension) && !configuredMimeType)) {
    return {
      ok: false,
      error: `Media type '.${extension || "unknown"}' is not allowed.`
    };
  }

  const mimeType = normalizeMimeType(input.mimeType);

  if (
    mimeType &&
    !isGenericMimeType(mimeType) &&
    !mimeMatchesExtension(extension, mimeType, configuredMimeType)
  ) {
    return {
      ok: false,
      error: `MIME type '${mimeType}' does not match media type '.${extension}'.`
    };
  }

  if ((input.ieXssProtect ?? true) && containsIeXssContent(input.body)) {
    return {
      ok: false,
      error: UPLOAD_XSS_MESSAGE
    };
  }

  return { ok: true };
}

export function effectiveMediaUploadMimeType(
  id: string,
  mimeType: string | null | undefined,
  mimePolicy?: Pick<MimeTypeConfig, "mimeType"> | null
): string {
  const extension = mediaExtension(id);
  const declaredMimeType = normalizeMimeType(mimeType);
  const configuredMimeType = normalizeMimeType(mimePolicy?.mimeType);

  if (declaredMimeType && !isGenericMimeType(declaredMimeType)) return declaredMimeType;
  if (configuredMimeType) return configuredMimeType;
  return normalizeMimeType(EXPECTED_MIME_TYPES[extension]?.[0]);
}

function mediaExtension(id: string): string {
  const name = mediaName(id);
  const marker = name.lastIndexOf(".");
  return marker === -1 ? "" : name.slice(marker + 1).toLowerCase();
}

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0].trim().toLowerCase();
}

function containsIeXssContent(body: ArrayBuffer): boolean {
  const prefix = new Uint8Array(body, 0, Math.min(body.byteLength, IE_XSS_SCAN_BYTES));
  const text = new TextDecoder("utf-8", { fatal: false }).decode(prefix);
  return IE_XSS_PATTERN.test(text);
}

function isGenericMimeType(mimeType: string): boolean {
  return mimeType === "application/octet-stream" || mimeType === "binary/octet-stream";
}

function mimeMatchesExtension(
  extension: string,
  mimeType: string,
  configuredMimeType: string
): boolean {
  return new Set(
    [...(EXPECTED_MIME_TYPES[extension] ?? []), configuredMimeType].filter(Boolean)
  ).has(mimeType);
}
