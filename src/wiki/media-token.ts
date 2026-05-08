import { cleanMediaId } from "./media-service";

export interface RequestedMediaSize {
  width: number;
  height: number;
  requested: boolean;
}

const MD5_BLOCK_BYTES = 64;
const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];
const MD5_TABLE = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
);
const TEXT_ENCODER = new TextEncoder();

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
  if (!size.requested || !secret) return "";

  let tokenInput = cleanMediaId(id);
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
  if (!size.requested) return true;
  if (!candidate || !secret) return false;
  return constantTimeEqual(candidate, mediaToken(id, size, secret));
}

export function mediaSizeQuery(
  id: string,
  size: RequestedMediaSize,
  secret: string | null | undefined
): string {
  if (!size.requested || !secret) return "";

  const params = new URLSearchParams();
  if (size.width > 0) params.set("w", String(size.width));
  if (size.height > 0) params.set("h", String(size.height));
  params.set("tok", mediaToken(id, size, secret));
  return params.toString();
}

function mediaDimension(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function hmacMd5Hex(message: string, key: string): string {
  let keyBytes = utf8Bytes(key);
  if (keyBytes.length > MD5_BLOCK_BYTES) {
    keyBytes = md5(keyBytes);
  }

  const innerPad = new Uint8Array(MD5_BLOCK_BYTES);
  const outerPad = new Uint8Array(MD5_BLOCK_BYTES);
  innerPad.fill(0x36);
  outerPad.fill(0x5c);

  for (let index = 0; index < keyBytes.length; index += 1) {
    innerPad[index] ^= keyBytes[index];
    outerPad[index] ^= keyBytes[index];
  }

  return bytesToHex(md5(concatBytes(outerPad, md5(concatBytes(innerPad, utf8Bytes(message))))));
}

function md5(input: Uint8Array): Uint8Array {
  const paddedLength = md5PaddedLength(input.length);
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += MD5_BLOCK_BYTES) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    const words = Array.from({ length: 16 }, (_, index) =>
      view.getUint32(offset + index * 4, true)
    );

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;

      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }

      const sum = (a + f + MD5_TABLE[index] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + leftRotate(sum, MD5_SHIFTS[index])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return digest;
}

function md5PaddedLength(inputLength: number): number {
  let length = inputLength + 1;
  while (length % MD5_BLOCK_BYTES !== 56) {
    length += 1;
  }
  return length + 8;
}

function leftRotate(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
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

function utf8Bytes(value: string): Uint8Array {
  return TEXT_ENCODER.encode(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}
