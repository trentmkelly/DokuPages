import { bytesToHex, md5Bytes, md5Hex, utf8Bytes } from "../crypto/md5";
import { cleanMediaId, isExternalMediaId } from "./media-service";

export { md5Hex };

export interface RequestedMediaSize {
  width: number;
  height: number;
  requested: boolean;
}

const MD5_BLOCK_BYTES = 64;

export function requestedMediaSizeFromUrl(url: URL): RequestedMediaSize {
  return requestedMediaSize(url.searchParams.get("w"), url.searchParams.get("h"));
}

export function requestedMediaSize(
  rawWidth: string | number | null | undefined,
  rawHeight: string | number | null | undefined
): RequestedMediaSize {
  const width = mediaDimension(rawWidth);
  const height = mediaDimension(rawHeight);

  return {
    width,
    height,
    requested: width > 0 || height > 0
  };
}

export function mediaToken(
  id: string,
  size: RequestedMediaSize,
  secret: string | null | undefined
): string {
  if (!requiresMediaToken(id, size) || !secret) return "";

  let tokenInput = isExternalMediaId(id) ? id : cleanMediaId(id);
  if (size.width > 0) tokenInput += `.${size.width}`;
  if (size.height > 0) tokenInput += `.${size.height}`;

  return hmacMd5Hex(tokenInput, secret).slice(0, 6);
}

export function validMediaToken(
  id: string,
  size: RequestedMediaSize,
  candidate: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!requiresMediaToken(id, size)) return true;
  if (!candidate || !secret) return false;
  return constantTimeEqual(candidate, mediaToken(id, size, secret));
}

export function mediaSizeQuery(
  id: string,
  size: RequestedMediaSize,
  secret: string | null | undefined
): string {
  if (!requiresMediaToken(id, size) || !secret) return "";

  const params = new URLSearchParams();
  if (size.width > 0) params.set("w", String(size.width));
  if (size.height > 0) params.set("h", String(size.height));
  params.set("tok", mediaToken(id, size, secret));
  return params.toString();
}

function requiresMediaToken(id: string, size: RequestedMediaSize): boolean {
  return size.requested || isExternalMediaId(id);
}

function mediaDimension(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function hmacMd5Hex(message: string, key: string): string {
  let keyBytes = utf8Bytes(key);
  if (keyBytes.length > MD5_BLOCK_BYTES) {
    keyBytes = md5Bytes(keyBytes);
  }

  const innerPad = new Uint8Array(MD5_BLOCK_BYTES);
  const outerPad = new Uint8Array(MD5_BLOCK_BYTES);
  innerPad.fill(0x36);
  outerPad.fill(0x5c);

  for (let index = 0; index < keyBytes.length; index += 1) {
    innerPad[index] ^= keyBytes[index];
    outerPad[index] ^= keyBytes[index];
  }

  return bytesToHex(
    md5Bytes(concatBytes(outerPad, md5Bytes(concatBytes(innerPad, utf8Bytes(message)))))
  );
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}
